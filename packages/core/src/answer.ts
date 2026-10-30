// Trả lời một câu hỏi bằng các đoạn truy hồi, không streaming (Giai đoạn 2, T4 + T5).
//
// Route chat dùng bản streaming để hiện dần câu trả lời; phần đánh giá và các lệnh chạy nền cần
// một câu trả lời trọn vẹn, nên logic truy hồi + prompt + đọc marker nằm ở đây để cả hai dùng
// chung một đường.

import { buildChatMessages, type ChatCompleter, type Citation, parseCitations } from './chat';
import type { Db } from './db/client';
import type { Embedder } from './embed';
import type { SearchHit } from './search';
import { hybridSearch } from './search';

export type AnswerResult = {
  answer: string;
  hits: SearchHit[];
  citations: Citation[];
};

export async function answerQuestion(input: {
  question: string;
  embed: Embedder;
  chat: ChatCompleter;
  db?: Db;
  limit?: number;
  candidates?: number;
  /** Dùng trong test: thay cho `hybridSearch` khi không có database. */
  search?: (question: string) => Promise<SearchHit[]>;
}): Promise<AnswerResult> {
  const hits = input.search
    ? await input.search(input.question)
    : await hybridSearch({
        query: input.question,
        embed: input.embed,
        db: input.db,
        limit: input.limit ?? 6,
        candidates: input.candidates,
      });

  if (hits.length === 0) {
    return { answer: '', hits: [], citations: [] };
  }

  const answer = await input.chat(buildChatMessages(input.question, hits));
  return { answer, hits, citations: parseCitations(answer, hits) };
}
