import { isLocalOllamaEndpoint, resolveOllamaBaseUrl } from '@research-hub/core/env';

// Cấu hình Ollama dùng chung cho các route gọi model (chat, sinh vector, đánh giá).
// Ollama cục bộ không cần khoá; chỉ gửi Authorization khi endpoint ở xa và có khoá.
export function ollamaConfig(): { endpoint: string; apiKey: string | undefined } {
  const endpoint = resolveOllamaBaseUrl(process.env.OLLAMA_BASE_URL);
  const apiKey = process.env.OLLAMA_API_KEY?.trim();
  return { endpoint, apiKey: isLocalOllamaEndpoint(endpoint) ? undefined : apiKey };
}
