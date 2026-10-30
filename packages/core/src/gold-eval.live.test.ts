import { neon } from '@neondatabase/serverless';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { answerQuestion } from './answer';
import { createOllamaChat } from './chat';
import { contentHash } from './content-hash';
import type { Db } from './db/client';
import { documents } from './db/schema';
import { CLOUDFLARE_EMBED_MODEL, createCloudflareEmbedder } from './embed';
import { ACCURACY_TARGET, evaluateCitations } from './eval-citations';
import { GOLD_DOCUMENTS } from './gold-corpus';
import { GOLD_QUESTIONS } from './gold-questions';
import { seedGoldCorpus } from './gold-seed';
import { indexDocument } from './index-document';

// Nghiệm thu Phase 2 trên hạ tầng thật (T5): nạp 6 tài liệu mẫu, sinh vector, chạy cả 30 câu hỏi
// vàng qua chat và chấm tỉ lệ trích dẫn đúng.
//
// Chỉ chạy khi có `EVAL_LIVE=1` cùng `DATABASE_URL`, `CLOUDFLARE_ACCOUNT_ID`,
// `CLOUDFLARE_API_TOKEN`, `OLLAMA_API_KEY`. Dữ liệu thử được xoá ở `afterAll`.

const enabled =
  process.env.EVAL_LIVE === '1' &&
  Boolean(
    process.env.DATABASE_URL &&
      process.env.CLOUDFLARE_ACCOUNT_ID &&
      process.env.CLOUDFLARE_API_TOKEN &&
      process.env.OLLAMA_API_KEY,
  );
const live = enabled ? describe : describe.skip;

let db: Db;

live('nghiệm thu bộ 30 câu hỏi vàng', () => {
  beforeAll(async () => {
    db = drizzle(neon(process.env.DATABASE_URL as string)) as unknown as Db;

    await seedGoldCorpus({ db });
    const embed = createCloudflareEmbedder({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID as string,
      apiToken: process.env.CLOUDFLARE_API_TOKEN as string,
    });
    for (const document of GOLD_DOCUMENTS) {
      const [row] = await db
        .select({ id: documents.id })
        .from(documents)
        .where(inArray(documents.hash, [contentHash(document.markdown)]));
      if (!row) throw new Error(`thiếu tài liệu ${document.title}`);
      await indexDocument({
        documentId: row.id,
        embed,
        model: CLOUDFLARE_EMBED_MODEL,
        db,
        dim: 1024,
        readMarkdown: async () => document.markdown,
      });
    }
  }, 300_000);

  afterAll(async () => {
    if (!db) return;
    await db.delete(documents).where(
      inArray(
        documents.hash,
        GOLD_DOCUMENTS.map((d) => contentHash(d.markdown)),
      ),
    );
  });

  it('đạt ngưỡng 80% câu trả lời có trích dẫn đúng', async () => {
    const embed = createCloudflareEmbedder({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID as string,
      apiToken: process.env.CLOUDFLARE_API_TOKEN as string,
    });
    const chat = createOllamaChat({
      baseUrl: 'https://ollama.com',
      apiKey: process.env.OLLAMA_API_KEY as string,
    });

    const report = await evaluateCitations({
      questions: GOLD_QUESTIONS,
      ask: async (question) => {
        const result = await answerQuestion({ question, embed, chat, db });
        return { answer: result.answer, hits: result.hits };
      },
    });

    const failed = report.outcomes.filter((outcome) => !outcome.correct).map((o) => o.id);
    console.log(
      JSON.stringify({
        accuracy: report.accuracy,
        correct: report.correct,
        total: report.total,
        failed,
      }),
    );
    expect(report.total).toBe(30);
    expect(report.accuracy).toBeGreaterThanOrEqual(ACCURACY_TARGET);
  }, 900_000);
});
