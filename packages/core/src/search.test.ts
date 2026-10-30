import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { mergeRrf, type RankedItem, RRF_K, searchFullText } from './search';

// Nhánh full-text chạy đúng câu SQL dùng trong production: hàm `rh_unaccent` lấy từ migration
// 0005 nên câu hỏi có dấu và không dấu được kiểm trên cùng một implementation. Nhánh vector cần
// pgvector (PGlite không có) nên phần hợp nhất RRF được kiểm bằng dữ liệu dựng tay.

const pg = new PGlite();

beforeAll(async () => {
  const migration = readFileSync(
    new URL('../drizzle/0005_search_indexes.sql', import.meta.url),
    'utf8',
  );
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (/FUNCTION/i.test(statement)) await pg.exec(statement);
  }
  await pg.exec(`
    create table documents (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      storage_key text not null,
      hash text not null,
      status text default 'ready' not null
    );
    create table chunks (
      id uuid primary key default gen_random_uuid(),
      document_id uuid not null references documents(id) on delete cascade,
      ord integer not null,
      text text not null,
      token_count integer,
      embed_model text,
      embedding text
    );
  `);
}, 20_000);

afterAll(() => pg.close());

beforeEach(async () => {
  await pg.exec('truncate chunks, documents restart identity cascade');
});

async function seed(title: string, chunks: string[]): Promise<string> {
  const [document] = (
    await pg.query<{ id: string }>(
      `insert into documents (title, storage_key, hash) values ($1, $2, $3) returning id`,
      [title, `documents/${title}.md`, `${title}-hash`],
    )
  ).rows;
  if (!document) throw new Error('seed failed');
  for (const [ord, text] of chunks.entries()) {
    await pg.query('insert into chunks (document_id, ord, text) values ($1, $2, $3)', [
      document.id,
      ord,
      text,
    ]);
  }
  return document.id;
}

describe('searchFullText', () => {
  it('matches a query with and without Vietnamese diacritics', async () => {
    const db = drizzle(pg) as unknown as Db;
    await seed('Hợp đồng thuê nhà', [
      'Hợp đồng thuê nhà quy định bên thuê thanh toán tiền thuê đúng hạn theo thỏa thuận.',
      'Bên cho thuê bàn giao nhà kèm trang thiết bị.',
    ]);

    const withDiacritics = await searchFullText({ db, query: 'hợp đồng thuê' });
    const withoutDiacritics = await searchFullText({ db, query: 'hop dong thue' });

    expect(withDiacritics.length).toBeGreaterThan(0);
    expect(withoutDiacritics.map((item) => item.chunkId)).toEqual(
      withDiacritics.map((item) => item.chunkId),
    );
  });

  it('ranks the chunk that repeats the term higher', async () => {
    const db = drizzle(pg) as unknown as Db;
    await seed('Chấm dứt hợp đồng', [
      'Hợp đồng chấm dứt khi hết hạn.',
      'Hợp đồng chấm dứt khi hết hạn hoặc khi một bên vi phạm hợp đồng.',
    ]);

    const hits = await searchFullText({ db, query: 'hợp đồng' });

    expect(hits).toHaveLength(2);
    expect(hits[0]?.ord).toBe(1);
  });

  it('returns nothing when no chunk contains the terms', async () => {
    const db = drizzle(pg) as unknown as Db;
    await seed('Hợp đồng thuê nhà', ['Bên thuê thanh toán tiền thuê đúng hạn.']);

    expect(await searchFullText({ db, query: 'chứng khoán' })).toEqual([]);
  });
});

function item(chunkId: string, ord = 0): RankedItem {
  return {
    chunkId,
    documentId: `doc-${chunkId}`,
    documentTitle: `Tài liệu ${chunkId}`,
    ord,
    text: `Đoạn ${chunkId}`,
    score: 1,
  };
}

describe('mergeRrf', () => {
  it('adds up the reciprocal rank of each branch', () => {
    const hits = mergeRrf({
      fts: [item('a'), item('b')],
      vector: [item('b'), item('c')],
      limit: 10,
    });

    expect(hits.map((hit) => hit.chunkId)).toEqual(['b', 'a', 'c']);
    const b = hits.find((hit) => hit.chunkId === 'b');
    expect(b?.rrf).toBeCloseTo(1 / (RRF_K + 2) + 1 / (RRF_K + 1));
    expect(b?.ftsRank).toBe(2);
    expect(b?.vectorRank).toBe(1);
  });

  it('keeps single-branch hits with their own rank', () => {
    const hits = mergeRrf({ fts: [item('a')], vector: [], limit: 10 });

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ chunkId: 'a', ftsRank: 1, vectorRank: null });
    expect(hits[0]?.rrf).toBeCloseTo(1 / (RRF_K + 1));
  });

  it('truncates to the requested limit', () => {
    const truncated = mergeRrf({
      fts: [item('x'), item('y')],
      vector: [],
      limit: 1,
    });

    expect(truncated).toHaveLength(1);
    expect(truncated[0]?.chunkId).toBe('x');
  });
});
