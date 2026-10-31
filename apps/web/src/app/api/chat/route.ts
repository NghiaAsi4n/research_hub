import { CHAT_MODEL, type ChatMessage } from '@research-hub/core/chat';
import { holdOllamaQueueForStream, ollamaQueue } from '@research-hub/core/ollama-queue';
import { hybridSearch } from '@research-hub/core/search';
import { createChatHandler } from '@/lib/chat-handler';
import { createEmbedder } from '@/lib/embedder';
import { ollamaConfig } from '@/lib/ollama';

// Chat streaming có trích dẫn (Giai đoạn 2, T4).
//
// Truy hồi bằng tìm kiếm lai, rồi chuyển luồng NDJSON của Ollama `/api/chat` thành SSE. Guard,
// đọc marker và danh sách trích dẫn nằm ở `@/lib/chat-handler` để test được.

export const maxDuration = 60;

function requestHeaders(apiKey: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  return headers;
}

const handler = createChatHandler({
  async search(question) {
    const { embed } = createEmbedder();
    return hybridSearch({ query: question, embed, limit: 6 });
  },

  async stream(messages: ChatMessage[], options?: { signal?: AbortSignal }) {
    const { endpoint, apiKey } = ollamaConfig();
    const signal = AbortSignal.any([
      options?.signal ?? new AbortController().signal,
      AbortSignal.timeout(55_000),
    ]);
    const release = await ollamaQueue.acquire('chat', {
      signal: options?.signal,
      timeoutMs: 15_000,
    });
    try {
      const response = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: requestHeaders(apiKey),
        body: JSON.stringify({ model: CHAT_MODEL, messages, stream: true }),
        signal,
      });
      if (!response.ok || !response.body) {
        release();
        throw new Error(`chat_failed: HTTP ${response.status}`);
      }
      return holdOllamaQueueForStream(response.body, release);
    } catch (error) {
      release();
      throw error;
    }
  },
});

export const POST = (request: Request) => handler(request);
