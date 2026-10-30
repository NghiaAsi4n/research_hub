import type { SearchHit } from './search';

// Chat trả lời có trích dẫn (Giai đoạn 2, T4).
//
// Mô hình chỉ được dùng các đoạn đã truy hồi, mỗi khẳng định phải kèm marker `[n]` trỏ về đoạn
// số n trong danh sách ngữ cảnh. Lớp này giữ phần dựng prompt và đọc marker để test được mà
// không cần gọi mô hình thật.

export const CHAT_MODEL = 'gemma4:31b';
export const MAX_CONTEXT_CHUNKS = 6;
export const REFUSAL_TEXT = 'Không đủ bằng chứng trong tài liệu để trả lời.';

export type ChatMessage = { role: 'system' | 'user'; content: string };

export type Citation = {
  index: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  ord: number;
  quote: string;
};

const SYSTEM_PROMPT = [
  'Bạn là trợ lý tra cứu tài liệu. Chỉ dùng các đoạn tài liệu được cung cấp.',
  'Mỗi khẳng định phải kèm marker [n] với n là số thứ tự đoạn đã dùng; không bịa marker.',
  `Nếu các đoạn không đủ trả lời, trả đúng câu: "${REFUSAL_TEXT}" và không thêm kết luận.`,
  'Trả lời bằng tiếng Việt, ngắn gọn, không nhắc tới việc bạn là mô hình.',
].join(' ');

export function buildChatMessages(question: string, hits: SearchHit[]): ChatMessage[] {
  const context = hits
    .slice(0, MAX_CONTEXT_CHUNKS)
    .map((hit, index) => `[${index + 1}] ${hit.documentTitle} — đoạn ${hit.ord + 1}\n${hit.text}`)
    .join('\n\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Tài liệu tham khảo:\n${context}\n\nCâu hỏi: ${question}` },
  ];
}

export function parseCitations(answer: string, hits: SearchHit[]): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const index = Number(match[1]);
    if (seen.has(index)) continue;
    const hit = hits[index - 1];
    if (!hit) continue;
    seen.add(index);
    citations.push({
      index,
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      documentTitle: hit.documentTitle,
      ord: hit.ord,
      quote: hit.text.length > 240 ? `${hit.text.slice(0, 240)}…` : hit.text,
    });
  }
  return citations;
}

export function hasSupportedCitation(answer: string, hits: SearchHit[]): boolean {
  return parseCitations(answer, hits).length > 0;
}
