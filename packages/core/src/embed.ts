import { contentHash } from './content-hash';
import { type OllamaQueueClient, type OllamaQueueLane, ollamaQueue } from './ollama-queue';

// Sinh vector nhúng cho chunk (Giai đoạn 2, T2).
//
// Nhà cung cấp là API `/api/embed` của Ollama (chạy máy hoặc cloud). Lớp này chỉ lo gom lô, kiểm
// tra số chiều và báo lỗi có nguyên nhân; phần đọc/ghi DB nằm ở `embed-store.ts` để test được
// bằng hàm giả mà không cần mạng.

export const DEFAULT_EMBED_MODEL = 'qwen3-embedding';
export const DEFAULT_EMBED_BATCH = 16;

export type Embedder = (texts: string[], options?: { signal?: AbortSignal }) => Promise<number[][]>;

export class EmbedError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'EmbedError';
    this.status = status;
  }
}

export function createOllamaEmbedder(input: {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  lane?: OllamaQueueLane;
  queue?: OllamaQueueClient;
  onUsage?: (tokens: number) => void;
}): Embedder {
  const model = input.model ?? DEFAULT_EMBED_MODEL;
  const endpoint = `${input.baseUrl.replace(/\/+$/, '')}/api/embed`;
  const fetchImpl = input.fetchImpl ?? fetch;
  const queue = input.queue ?? ollamaQueue;

  return async (texts, options = {}) => {
    if (texts.length === 0) return [];
    return queue.run(
      input.lane ?? 'chat',
      async (signal) => {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        const apiKey = input.apiKey?.trim();
        if (apiKey) headers.authorization = `Bearer ${apiKey}`;

        let response: Response;
        try {
          response = await fetchImpl(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model, input: texts }),
            signal,
          });
        } catch (error) {
          if (signal.aborted) throw error;
          throw new EmbedError(`ollama_unreachable: ${(error as Error).message}`);
        }

        if (!response.ok) {
          throw new EmbedError(`embed_failed: HTTP ${response.status}`, response.status);
        }

        const payload = (await response.json().catch(() => null)) as {
          embeddings?: unknown;
          prompt_eval_count?: unknown;
        } | null;
        const embeddings = payload?.embeddings;
        if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
          throw new EmbedError('embed_invalid_response');
        }
        for (const vector of embeddings) {
          if (!Array.isArray(vector) || vector.some((value) => typeof value !== 'number')) {
            throw new EmbedError('embed_invalid_vector');
          }
        }
        const actualTokens =
          typeof payload?.prompt_eval_count === 'number'
            ? payload.prompt_eval_count
            : Math.ceil(texts.reduce((total, text) => total + text.length, 0) / 4);
        input.onUsage?.(actualTokens);
        return embeddings as number[][];
      },
      { signal: options.signal },
    );
  };
}

// Workers AI của Cloudflare: dùng khi tài khoản Ollama không mở endpoint `/api/embed`.
// `@cf/baai/bge-m3` trả 1024 chiều, khớp cột `chunks.embedding` và `EMBED_DIM` mặc định.
export const CLOUDFLARE_EMBED_MODEL = '@cf/baai/bge-m3';

export function createCloudflareEmbedder(input: {
  accountId: string;
  apiToken: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): Embedder {
  const model = input.model ?? CLOUDFLARE_EMBED_MODEL;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/ai/run/${model}`;
  const fetchImpl = input.fetchImpl ?? fetch;

  return async (texts, options = {}) => {
    if (texts.length === 0) return [];
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: texts }),
        signal: options.signal,
      });
    } catch (error) {
      throw new EmbedError(`cloudflare_unreachable: ${(error as Error).message}`);
    }

    if (!response.ok) {
      throw new EmbedError(`embed_failed: HTTP ${response.status}`, response.status);
    }

    const payload = (await response.json().catch(() => null)) as {
      result?: { data?: unknown };
    } | null;
    const vectors = payload?.result?.data;
    if (!Array.isArray(vectors) || vectors.length !== texts.length) {
      throw new EmbedError('embed_invalid_response');
    }
    for (const vector of vectors) {
      if (!Array.isArray(vector) || vector.some((value) => typeof value !== 'number')) {
        throw new EmbedError('embed_invalid_vector');
      }
    }
    return vectors as number[][];
  };
}

export async function embedInBatches(input: {
  texts: string[];
  embed: Embedder;
  batchSize?: number;
  onBatch?: (vectors: number[][], offset: number) => void;
}): Promise<number[][]> {
  const batchSize = Math.max(1, Math.trunc(input.batchSize ?? DEFAULT_EMBED_BATCH));
  const vectors: number[][] = [];

  for (let offset = 0; offset < input.texts.length; offset += batchSize) {
    const batch = input.texts.slice(offset, offset + batchSize);
    const result = await input.embed(batch);
    if (result.length !== batch.length) {
      throw new EmbedError(`embed_batch_mismatch: ${result.length} != ${batch.length}`);
    }
    vectors.push(...result);
    input.onBatch?.(result, offset);
  }

  return vectors;
}

// Khoá cache của vector: băm nội dung chunk, nên hai chunk trùng chữ dùng lại một vector.
export function chunkTextHash(text: string): string {
  return contentHash(text);
}

export function assertEmbeddingDim(vector: number[], dim: number): void {
  if (vector.length !== dim) {
    throw new EmbedError(`embed_dim_mismatch: ${vector.length} != ${dim}`);
  }
}
