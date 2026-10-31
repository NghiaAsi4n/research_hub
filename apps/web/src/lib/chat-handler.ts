import {
  buildChatMessages,
  CHAT_MODEL,
  type ChatMessage,
  parseCitations,
  REFUSAL_TEXT,
} from '@research-hub/core/chat';
import type { SearchHit } from '@research-hub/core/search';
import { guardRequest } from './guard';

// Ranh giới HTTP của chat có trích dẫn (Giai đoạn 2, T4).
//
// Route mỏng: guard trước, truy hồi ngữ cảnh, rồi chuyển luồng NDJSON của Ollama thành SSE cho
// trình duyệt. Marker `[n]` trong câu trả lời được đổi thành danh sách trích dẫn kèm `chunkId`
// để UI mở đúng đoạn nguồn.

export type ChatDeps = {
  search: (question: string) => Promise<SearchHit[]>;
  stream: (
    messages: ChatMessage[],
    options?: { signal?: AbortSignal },
  ) => Promise<ReadableStream<Uint8Array>>;
};

const encoder = new TextEncoder();
const MAX_QUESTION_CHARS = 1000;

function event(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function tokenOf(line: string): string {
  try {
    const parsed = JSON.parse(line) as { message?: { content?: unknown } };
    const content = parsed.message?.content;
    return typeof content === 'string' ? content : '';
  } catch {
    return '';
  }
}

async function dump(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

function refusalResponse(): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(event({ type: 'token', text: REFUSAL_TEXT }));
      controller.enqueue(event({ type: 'citations', citations: [] }));
      controller.enqueue(event({ type: 'done' }));
      controller.close();
    },
  });
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function createChatHandler(deps: ChatDeps) {
  return async (request: Request): Promise<Response> => {
    const auth = await guardRequest({ route: 'chat', model: CHAT_MODEL });
    if (!auth.ok) return auth.response;

    const raw = (await request.json().catch(() => null)) as { question?: unknown } | null;
    const question = typeof raw?.question === 'string' ? raw.question.trim() : '';
    if (question.length === 0) {
      return Response.json({ error: 'invalid_question' }, { status: 400 });
    }
    if (question.length > MAX_QUESTION_CHARS) {
      return Response.json({ error: 'question_too_long' }, { status: 400 });
    }

    const hits = await deps.search(question);
    if (hits.length === 0) return refusalResponse();

    let upstream: ReadableStream<Uint8Array>;
    try {
      upstream = await deps.stream(buildChatMessages(question, hits), { signal: request.signal });
    } catch (error) {
      const timedOut = (error as Error).name === 'TimeoutError';
      return Response.json(
        { error: timedOut ? 'model_queue_timeout' : 'model_unavailable' },
        { status: timedOut ? 503 : 502 },
      );
    }
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let answer = '';

        const flushLine = (line: string) => {
          const text = tokenOf(line.trim());
          if (!text) return;
          answer += text;
          controller.enqueue(event({ type: 'token', text }));
        };

        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let index = buffer.indexOf('\n');
            while (index >= 0) {
              const line = buffer.slice(0, index);
              buffer = buffer.slice(index + 1);
              if (line.trim()) flushLine(line);
              index = buffer.indexOf('\n');
            }
          }
          if (buffer.trim()) flushLine(buffer);

          const citations = parseCitations(answer, hits);
          if (citations.length === 0) {
            // Không có marker hợp lệ nghĩa là câu trả lời không dựa trên đoạn nào: thay bằng câu
            // từ chối thay vì để người đọc tin một kết luận không nguồn.
            controller.enqueue(event({ type: 'replace', text: REFUSAL_TEXT }));
          }
          controller.enqueue(event({ type: 'citations', citations }));
          controller.enqueue(event({ type: 'done' }));
          controller.close();
        } catch (error) {
          controller.enqueue(
            event({ type: 'error', message: (error as Error).message ?? 'chat_failed' }),
          );
          controller.close();
        }
      },
      async cancel() {
        await upstream.cancel();
      },
    });

    return new Response(body, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
      },
    });
  };
}

export { dump as readSseText };
