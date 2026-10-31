import { describe, expect, it, vi } from 'vitest';
import {
  assertEmbeddingDim,
  CLOUDFLARE_EMBED_MODEL,
  chunkTextHash,
  createCloudflareEmbedder,
  createOllamaEmbedder,
  DEFAULT_EMBED_MODEL,
  EmbedError,
  embedInBatches,
} from './embed';
import { processOllamaQueue } from './ollama-queue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createOllamaEmbedder', () => {
  it('sends the model and every text in one request', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        embeddings: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
      }),
    );
    const embed = createOllamaEmbedder({
      baseUrl: 'https://ollama.com/',
      apiKey: 'secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      queue: processOllamaQueue,
    });

    const vectors = await embed(['một', 'hai']);

    expect(vectors).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ollama.com/api/embed');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret');
    expect(JSON.parse(init.body as string)).toEqual({
      model: DEFAULT_EMBED_MODEL,
      input: ['một', 'hai'],
    });
  });

  it('omits the authorization header for a local endpoint', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ embeddings: [[1]] }));
    const embed = createOllamaEmbedder({
      baseUrl: 'http://127.0.0.1:11434',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      queue: processOllamaQueue,
    });

    await embed(['x']);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('reports the upstream status when the provider refuses', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'unauthorized' }, 401));
    const embed = createOllamaEmbedder({
      baseUrl: 'https://ollama.com',
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      queue: processOllamaQueue,
    });

    await expect(embed(['x'])).rejects.toMatchObject({ name: 'EmbedError', status: 401 });
  });

  it('rejects a response with the wrong number of vectors', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ embeddings: [[1, 2]] }));
    const embed = createOllamaEmbedder({
      baseUrl: 'https://ollama.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      queue: processOllamaQueue,
    });

    await expect(embed(['a', 'b'])).rejects.toThrow(EmbedError);
  });

  it('rejects a vector containing non numbers', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ embeddings: [[1, 'x']] }));
    const embed = createOllamaEmbedder({
      baseUrl: 'https://ollama.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      queue: processOllamaQueue,
    });

    await expect(embed(['a'])).rejects.toThrow(/embed_invalid_vector/);
  });

  it('returns no vectors for an empty request without calling the provider', async () => {
    const fetchImpl = vi.fn();
    const embed = createOllamaEmbedder({
      baseUrl: 'https://ollama.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      queue: processOllamaQueue,
    });

    expect(await embed([])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('embedInBatches', () => {
  it('splits texts into batches and reports progress', async () => {
    const calls: string[][] = [];
    const embed = async (texts: string[]) => {
      calls.push(texts);
      return texts.map(() => [1]);
    };
    const offsets: number[] = [];

    const vectors = await embedInBatches({
      texts: ['a', 'b', 'c', 'd', 'e'],
      embed,
      batchSize: 2,
      onBatch: (_vectors, offset) => offsets.push(offset),
    });

    expect(calls).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    expect(offsets).toEqual([0, 2, 4]);
    expect(vectors).toHaveLength(5);
  });

  it('fails when the provider returns a different number of vectors than inputs', async () => {
    await expect(
      embedInBatches({ texts: ['a', 'b'], embed: async () => [[1]], batchSize: 2 }),
    ).rejects.toThrow(/embed_batch_mismatch/);
  });
});

describe('createCloudflareEmbedder', () => {
  it('sends the texts and returns the model vectors', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        result: {
          data: [
            [0.1, 0.2],
            [0.3, 0.4],
          ],
        },
      }),
    );
    const embed = createCloudflareEmbedder({
      accountId: 'acc',
      apiToken: 'token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const vectors = await embed(['một', 'hai']);

    expect(vectors).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/accounts/acc/ai/run/${CLOUDFLARE_EMBED_MODEL}`);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token');
    expect(JSON.parse(init.body as string)).toEqual({ text: ['một', 'hai'] });
  });

  it('reports the upstream status when Workers AI refuses', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ errors: [] }, 403));
    const embed = createCloudflareEmbedder({
      accountId: 'acc',
      apiToken: 'token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(embed(['x'])).rejects.toMatchObject({ name: 'EmbedError', status: 403 });
  });
});

describe('embedding helpers', () => {
  it('rejects a vector whose size differs from the configured dimension', () => {
    expect(() => assertEmbeddingDim([1, 2, 3], 3)).not.toThrow();
    expect(() => assertEmbeddingDim([1, 2], 3)).toThrow(/embed_dim_mismatch/);
  });

  it('hashes identical chunk text to the same key', () => {
    expect(chunkTextHash('Hợp đồng thuê nhà')).toBe(chunkTextHash('Hợp đồng thuê nhà'));
    expect(chunkTextHash('Hợp đồng thuê nhà')).not.toBe(chunkTextHash('Hợp đồng thuê xe'));
  });
});
