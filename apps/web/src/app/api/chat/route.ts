import { CHAT_MODEL, type ChatMessage } from '@research-hub/core/chat';
import { createOllamaEmbedder, DEFAULT_EMBED_MODEL } from '@research-hub/core/embed';
import { isLocalOllamaEndpoint, resolveOllamaBaseUrl } from '@research-hub/core/env';
import { hybridSearch } from '@research-hub/core/search';
import { createChatHandler } from '@/lib/chat-handler';

// Chat streaming có trích dẫn (Giai đoạn 2, T4).
//
// Truy hồi bằng tìm kiếm lai, rồi chuyển luồng NDJSON của Ollama `/api/chat` thành SSE. Guard,
// đọc marker và danh sách trích dẫn nằm ở `@/lib/chat-handler` để test được.

export const maxDuration = 60;

function ollamaRequest(): { endpoint: string; headers: Record<string, string> } {
  const endpoint = resolveOllamaBaseUrl(process.env.OLLAMA_BASE_URL);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const apiKey = process.env.OLLAMA_API_KEY?.trim();
  if (!isLocalOllamaEndpoint(endpoint) && apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return { endpoint, headers };
}

const handler = createChatHandler({
  async search(question) {
    const { endpoint, headers } = ollamaRequest();
    const embed = createOllamaEmbedder({
      baseUrl: endpoint,
      apiKey: headers.authorization?.replace(/^Bearer\s+/i, ''),
      model: DEFAULT_EMBED_MODEL,
    });
    return hybridSearch({ query: question, embed, limit: 6 });
  },

  async stream(messages: ChatMessage[]) {
    const { endpoint, headers } = ollamaRequest();
    const response = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: CHAT_MODEL, messages, stream: true }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`chat_failed: HTTP ${response.status}`);
    }
    return response.body;
  },
});

export const POST = (request: Request) => handler(request);
