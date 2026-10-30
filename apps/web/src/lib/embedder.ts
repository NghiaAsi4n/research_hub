import {
  CLOUDFLARE_EMBED_MODEL,
  createCloudflareEmbedder,
  createOllamaEmbedder,
  type Embedder,
} from '@research-hub/core/embed';
import { ollamaConfig } from './ollama';

// Chọn nhà cung cấp embedding theo biến môi trường (Giai đoạn 2, T2).
//
// `EMBED_PROVIDER=cloudflare` dùng Workers AI `@cf/baai/bge-m3` (1024 chiều); mặc định dùng
// Ollama khi tài khoản mở endpoint `/api/embed`. Trả kèm tên model để ghi vào `embed_model`,
// nhờ vậy đổi nhà cung cấp là reindex nhận ra.
export type EmbedderChoice = { embed: Embedder; model: string };

export function createEmbedder(env: NodeJS.ProcessEnv = process.env): EmbedderChoice {
  const explicit = (env.EMBED_PROVIDER ?? '').trim().toLowerCase();
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
  const cloudflareReady = Boolean(accountId && apiToken);
  const useCloudflare = explicit === 'cloudflare' || (explicit === '' && cloudflareReady);

  if (useCloudflare) {
    if (!accountId || !apiToken) throw new Error('missing_cloudflare_credentials');
    const model = env.EMBED_MODEL?.trim() || CLOUDFLARE_EMBED_MODEL;
    return { embed: createCloudflareEmbedder({ accountId, apiToken, model }), model };
  }

  const { endpoint, apiKey } = ollamaConfig();
  const model = env.EMBED_MODEL?.trim() || 'qwen3-embedding';
  return { embed: createOllamaEmbedder({ baseUrl: endpoint, apiKey, model }), model };
}
