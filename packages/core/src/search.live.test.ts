import { neon } from '@neondatabase/serverless';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { chunks, documents } from './db/schema';
import { hybridSearch, searchFullText, searchVector } from './search';

// Kiểm nhánh vector và câu SQL thật trên Postgres có pgvector (Giai đoạn 2, T3).
//
// PGlite không hỗ trợ toán tử `<=>`, nên phần này chỉ chạy khi có `SEARCH_LIVE=1` cùng
// `DATABASE_URL` trỏ vào database đã áp migration 0005. Vector ở đây là dữ liệu dựng tay, không
// gọi nhà cung cấp embedding, nên test kiểm đường SQL chứ không đo chất lượng model.

const enabled = process.env.SEARCH_LIVE === '1' && Boolean(process.env.DATABASE_URL);
const live = enabled ? describe : describe.skip;

function vector(seed: number): number[] {
  return Array.from({ length: 1024 }, (_, index) => (index < seed ? 1 : 0));
}

let db: Db;
let documentId: string;
let firstChunkId: string;
let secondChunkId: string;

live('tìm kiếm trên Postgres có pgvector', () => {
  beforeAll(async () => {
    const url = process.env.DATABASE_URL as string;
    db = drizzle(neon(url)) as unknown as Db;

    const [document] = await db
      .insert(documents)
      .values({
        title: 'Hợp đồng thuê nhà ở (kiểm thử live)',
        storageKey: `documents/live-${crypto.randomUUID()}.md`,
        hash: crypto.randomUUID().replace(/-/g, '').padEnd(64, 'a').slice(0, 64),
        status: 'ready',
      })
      .returning({ id: documents.id });
    if (!document) throw new Error('seed document failed');
    documentId = document.id;

    const [first, second] = await db
      .insert(chunks)
      .values([
        {
          documentId,
          ord: 0,
          text: 'Hợp đồng thuê nhà quy định bên thuê thanh toán tiền thuê đúng hạn.',
          embedModel: 'test-vector',
          embedding: vector(1),
        },
        {
          documentId,
          ord: 1,
          text: 'Hợp đồng chấm dứt khi hết thời hạn thuê hoặc khi một bên vi phạm.',
          embedModel: 'test-vector',
          embedding: vector(2),
        },
      ])
      .returning({ id: chunks.id });
    if (!first || !second) throw new Error('seed chunks failed');
    firstChunkId = first.id;
    secondChunkId = second.id;
  }, 60_000);

  afterAll(async () => {
    if (!documentId) return;
    await db.delete(chunks).where(inArray(chunks.id, [firstChunkId, secondChunkId]));
    await db.delete(documents).where(eq(documents.id, documentId));
  });

  it('khớp full-text khi câu hỏi không có dấu', async () => {
    const hits = await searchFullText({ db, query: 'hop dong thue nha' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.chunkId).toBe(firstChunkId);
  });

  it('xếp hạng vector theo cosine trên đúng chunk', async () => {
    const hits = await searchVector({ db, vector: vector(2), candidates: 10 });
    expect(hits[0]?.chunkId).toBe(secondChunkId);
    expect(hits[0]?.score).toBeCloseTo(1, 3);
  });

  it('hợp nhất hai nhánh và giữ hạng của từng nhánh', async () => {
    const hits = await hybridSearch({
      db,
      query: 'hop dong',
      embed: async () => [vector(1)],
      limit: 5,
      candidates: 10,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.chunkId).toBe(firstChunkId);
    expect(hits[0]?.ftsRank).not.toBeNull();
    expect(hits[0]?.vectorRank).not.toBeNull();
  });
});
