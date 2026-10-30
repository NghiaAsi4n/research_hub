import { CHAT_MODEL, type ChatMessage } from '@research-hub/core/chat';
import { createOllamaEmbedder, DEFAULT_EMBED_MODEL } from '@research-hub/core/embed';
import { hybridSearch } from '@research-hub/core/search';
import { createChatHandler } from '@/lib/chat-handler';
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
    const { endpoint, apiKey } = ollamaConfig();
    const embed = createOllamaEmbedder({ baseUrl: endpoint, apiKey, model: DEFAULT_EMBED_MODEL });
    return hybridSearch({ query: question, embed, limit: 6 });
  },

  async stream(messages: ChatMessage[]) {
    const { endpoint, apiKey } = ollamaConfig();
    const response = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: requestHeaders(apiKey),
      body: JSON.stringify({ model: CHAT_MODEL, messages, stream: true }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`chat_failed: HTTP ${response.status}`);
    }
    return response.body;
  },
});

export const POST = (request: Request) => handler(request);
