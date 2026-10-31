import { REFUSAL_TEXT } from '@research-hub/core/chat';
import type { SearchHit } from '@research-hub/core/search';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { guard } = vi.hoisted(() => ({ guard: vi.fn() }));
vi.mock('./guard', () => ({ guardRequest: guard }));

import { createChatHandler, readSseText } from './chat-handler';

function hit(chunkId: string, ord = 0): SearchHit {
  return {
    chunkId,
    documentId: `doc-${chunkId}`,
    documentTitle: `Tài liệu ${chunkId}`,
    ord,
    text: `Đoạn ${chunkId}`,
    ftsRank: 1,
    vectorRank: 1,
    vectorScore: 0.8,
    rrf: 0.03,
  };
}

function ndjsonStream(chunks: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
      controller.close();
    },
  });
}

const request = (body?: unknown) =>
  new Request('http://localhost/api/chat', {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  guard.mockResolvedValue({ ok: true, subject: 'reader-a' });
});

describe('chat boundary', () => {
  it('rejects an unauthenticated request before retrieval', async () => {
    guard.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    const search = vi.fn();

    const response = await createChatHandler({ search, stream: vi.fn() })(
      request({ question: 'x' }),
    );

    expect(response.status).toBe(401);
    expect(search).not.toHaveBeenCalled();
  });

  it('rejects an empty question', async () => {
    const response = await createChatHandler({ search: vi.fn(), stream: vi.fn() })(
      request({ question: '  ' }),
    );

    expect(response.status).toBe(400);
  });

  it('refuses without calling the model when nothing was retrieved', async () => {
    const stream = vi.fn();
    const response = await createChatHandler({ search: async () => [], stream })(
      request({ question: 'hỏi' }),
    );

    const text = await readSseText(response.body as ReadableStream<Uint8Array>);
    expect(stream).not.toHaveBeenCalled();
    expect(text).toContain(REFUSAL_TEXT);
    expect(text).toContain('"citations":[]');
  });

  it('streams tokens then maps markers to citations', async () => {
    const stream = vi.fn(async () =>
      ndjsonStream([
        { message: { content: 'Thời hạn là 12 tháng ' } },
        { message: { content: 'theo hợp đồng [1].' }, done: true },
      ]),
    );
    const response = await createChatHandler({
      search: async () => [hit('a'), hit('b', 1)],
      stream,
    })(request({ question: 'thời hạn?' }));

    const text = await readSseText(response.body as ReadableStream<Uint8Array>);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(text).toContain('"text":"Thời hạn là 12 tháng "');
    expect(text).toContain('"citations":[{"index":1,"chunkId":"a"');
    expect(text).not.toContain('"type":"replace"');
  });

  it('replaces an answer that cites nothing with the refusal sentence', async () => {
    const stream = vi.fn(async () =>
      ndjsonStream([{ message: { content: 'Tôi đoán là 24 tháng.' }, done: true }]),
    );
    const response = await createChatHandler({
      search: async () => [hit('a')],
      stream,
    })(request({ question: 'thời hạn?' }));

    const text = await readSseText(response.body as ReadableStream<Uint8Array>);

    expect(text).toContain('"type":"replace"');
    expect(text).toContain('"citations":[]');
  });

  it('reports an upstream failure as a retryable response instead of hanging', async () => {
    const stream = vi.fn(async () => {
      throw new Error('ollama_unreachable');
    });
    const response = await createChatHandler({ search: async () => [hit('a')], stream })(
      request({ question: 'hỏi' }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'model_unavailable' });
  });
});
