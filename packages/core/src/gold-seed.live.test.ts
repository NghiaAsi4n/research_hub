import { neon } from '@neondatabase/serverless';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentHash } from './content-hash';
import type { Db } from './db/client';
import { documents } from './db/schema';
import { findGoldDocument, GOLD_DOCUMENTS } from './gold-corpus';
import { GOLD_QUESTIONS } from './gold-questions';
import { seedGoldCorpus } from './gold-seed';
import { searchFullText } from './search';

// Nạp sáu tài liệu mẫu lên Postgres thật rồi kiểm truy hồi full-text (Giai đoạn 2, T5).
//
// Chỉ chạy khi có `SEED_LIVE=1` cùng `DATABASE_URL` (đã áp migration 0005). Dùng để chứng minh
// đường nạp dữ liệu và tìm kiếm không dấu chạy đúng trên hạ tầng thật; không đo chất lượng model.

const enabled = process.env.SEED_LIVE === '1' && Boolean(process.env.DATABASE_URL);
const live = enabled ? describe : describe.skip;

let db: Db;

live('nạp bộ câu hỏi vàng lên Postgres', () => {
  beforeAll(async () => {
    db = drizzle(neon(process.env.DATABASE_URL as string)) as unknown as Db;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    const hashes = GOLD_DOCUMENTS.map((document) => contentHash(document.markdown));
    await db.delete(documents).where(inArray(documents.hash, hashes));
  });

  it('nạp đủ 6 tài liệu và chạy lại không nhân bản', async () => {
    const first = await seedGoldCorpus({ db });
    const second = await seedGoldCorpus({ db });

    expect(first).toHaveLength(6);
    expect(second.map((entry) => entry.documentId)).toEqual(first.map((entry) => entry.documentId));
  });

  it('tìm được đoạn chứa đáp án cho ba câu hỏi mẫu', async () => {
    for (const question of GOLD_QUESTIONS.slice(0, 3)) {
      const hits = await searchFullText({ db, query: question.question });
      const expected = question.contains.toLowerCase();
      const found = hits.some(
        (hit) =>
          hit.documentTitle === question.documentTitle && hit.text.toLowerCase().includes(expected),
      );
      const document = findGoldDocument(question.documentTitle);
      expect(document?.markdown.toLowerCase()).toContain(expected);
      expect(found, `không tìm thấy ${question.id}`).toBe(true);
    }
  });
});
