import { isLocalOllamaEndpoint, resolveOllamaBaseUrl } from '@research-hub/core/env';
import { requireUser, tooManyRequestsResponse, unauthorizedResponse } from '@/lib/auth/server';
import { checkRateLimit } from '@/lib/rate-limit';

// Giai đoạn 0 bước 7: xác nhận vector đúng 1024 chiều, khớp cột chunks.embedding.
const EXPECTED_EMBED_DIM = 1024;

// Model nhúng chạy ở máy, đã pull ở Giai đoạn 0. Giá trị này phải được ghi vào
// chunks.embed_model khi lưu, vì đổi model là phải sinh lại toàn bộ vector.
const EMBED_MODEL = 'bge-m3';

export async function POST(request: Request) {
  try {
    await requireUser();
  } catch {
    return unauthorizedResponse();
  }

  const limit = checkRateLimit('embed', 20, 60_000);
  if (!limit.allowed) {
    return tooManyRequestsResponse(limit.retryAfterSeconds);
  }

  // Route này đọc thẳng process.env thay vì getEnv() để nhúng cục bộ vẫn chạy được khi
  // chưa có khoá cloud (CLOUDFLARE_API_TOKEN, OLLAMA_API_KEY).
  const endpoint = resolveOllamaBaseUrl(process.env.OLLAMA_BASE_URL);
  const local = isLocalOllamaEndpoint(endpoint);
  const apiKey = process.env.OLLAMA_API_KEY?.trim();

  if (!local && !apiKey) {
    return Response.json({ error: 'missing_ollama_api_key', endpoint }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as { input?: unknown };
  const input =
    typeof body.input === 'string' && body.input.length > 0 ? body.input : 'kiểm tra số chiều';

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (!local && apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(`${endpoint}/api/embed`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: EMBED_MODEL, input }),
    });
  } catch {
    return Response.json({ error: 'ollama_unreachable', endpoint }, { status: 502 });
  }

  if (!response.ok) {
    return Response.json(
      { error: 'embed_failed', endpoint, upstreamStatus: response.status },
      { status: 502 },
    );
  }

  const payload = (await response.json()) as { embeddings?: number[][] };
  const actualDim = payload.embeddings?.[0]?.length ?? 0;

  return Response.json({
    endpoint,
    local,
    model: EMBED_MODEL,
    expectedDim: EXPECTED_EMBED_DIM,
    actualDim,
    matches: actualDim === EXPECTED_EMBED_DIM,
  });
}
