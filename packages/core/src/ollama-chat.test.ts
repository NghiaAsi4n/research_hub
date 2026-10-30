import { describe, expect, it, vi } from 'vitest';
import { createOllamaChat } from './chat';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createOllamaChat', () => {
  it('posts the messages without streaming and returns the content', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ message: { content: 'Mười hai tháng [1].' } }),
    );
    const chat = createOllamaChat({
      baseUrl: 'https://ollama.com/',
      apiKey: 'secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const answer = await chat([{ role: 'user', content: 'hỏi' }]);

    expect(answer).toBe('Mười hai tháng [1].');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ollama.com/api/chat');
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'gemma4:31b',
      stream: false,
    });
  });

  it('reports the upstream status when the provider refuses', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'unauthorized' }, 401));
    const chat = createOllamaChat({
      baseUrl: 'https://ollama.com',
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(chat([])).rejects.toThrow(/chat_failed: HTTP 401/);
  });

  it('rejects a response without message content', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ done: true }));
    const chat = createOllamaChat({
      baseUrl: 'https://ollama.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(chat([])).rejects.toThrow(/chat_invalid_response/);
  });
});
