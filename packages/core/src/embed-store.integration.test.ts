import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { embedDocumentChunks } from './embed-store';

// PGlite không có pgvector, nên ở đây `vector` được khai là domain của text: câu lệnh ghi thật
// `(entry->>'vec')::vector` vẫn chạy, chỉ khác kiểu lưu. Phần cần kiểm là logic cache, gom lô và
// số lượt gọi nhà cung cấp.

const pg = new PGlite();

beforeAll(async () => {
  await pg.exec(`
    create domain vector as text;
    create table documents (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      storage_key text not null,
      hash text not null,
      status text default 'pending' not null
    );
    create table chunks (
      id uuid primary key default gen_random_uuid(),
      document_id uuid not null references documents(id) on delete cascade,
      ord integer not null,
      text text not null,
      token_count integer,
      embed_model text,
      embedding vector
    );
    create unique index chunks_document_ord_idx on chunks (document_id, ord);
  `);
}, 20_000);

afterAll(() => pg.close());

beforeEach(async () => {
  await pg.exec('truncate chunks, documents restart identity cascade');
});

async function seedDocument(prefix: string, texts: string[]): Promise<string> {
  const [document] = (
    await pg.query<{ id: string }>(
      `insert into documents (title, storage_key, hash)
       values ($1, $2, $3) returning id`,
      [prefix, `documents/${prefix}.md`, `${prefix}-hash`],
    )
  ).rows;
  if (!document) throw new Error('seed document failed');
  for (const [ord, text] of texts.entries()) {
    await pg.query('insert into chunks (document_id, ord, text) values ($1, $2, $3)', [
      document.id,
      ord,
      text,
    ]);
  }
  return document.id;
}

function fakeEmbedder() {
  const calls: string[][] = [];
  const embed = async (texts: string[]) => {
    calls.push(texts);
    return texts.map((text) => Array.from({ length: 4 }, (_, index) => text.length + index));
  };
  return { calls, embed };
}

describe('embedDocumentChunks', () => {
  it('embeds every chunk in batches and records the model', async () => {
    const db = drizzle(pg) as unknown as Db;
    const documentId = await seedDocument('a', ['một', 'hai', 'ba', 'bốn', 'năm']);
    const { calls, embed } = fakeEmbedder();

    const report = await embedDocumentChunks({ db, documentId, embed, batchSize: 2, dim: 4 });

    expect(report).toMatchObject({ scanned: 5, embedded: 5, reused: 0, batches: 3 });
    expect(calls.map((batch) => batch.length)).toEqual([2, 2, 1]);
    const rows = await pg.query<{ embed_model: string; embedding: string }>(
      'select embed_model, embedding from chunks where document_id = $1 order by ord',
      [documentId],
    );
    expect(rows.rows.every((row) => row.embed_model === 'qwen3-embedding')).toBe(true);
    expect(rows.rows[0]?.embedding).toBe('[3,4,5,6]');
  });

  it('skips chunks that already carry the current model', async () => {
    const db = drizzle(pg) as unknown as Db;
    const documentId = await seedDocument('b', ['một', 'hai']);
    await embedDocumentChunks({ db, documentId, embed: fakeEmbedder().embed, dim: 4 });

    const second = fakeEmbedder();
    const report = await embedDocumentChunks({ db, documentId, embed: second.embed, dim: 4 });

    expect(report).toMatchObject({ embedded: 0, reused: 2, batches: 0 });
    expect(second.calls).toHaveLength(0);
  });

  it('reuses a vector cached from another document with the same chunk text', async () => {
    const db = drizzle(pg) as unknown as Db;
    await seedDocument('c', ['điều khoản chung']);
    const first = fakeEmbedder();
    await embedDocumentChunks({
      db,
      documentId: (await pg.query<{ id: string }>('select id from documents limit 1')).rows[0]
        ?.id as string,
      embed: first.embed,
      dim: 4,
    });

    const documentId = await seedDocument('d', ['điều khoản chung', 'điều khoản riêng']);
    const second = fakeEmbedder();
    const report = await embedDocumentChunks({ db, documentId, embed: second.embed, dim: 4 });

    expect(report).toMatchObject({ scanned: 2, embedded: 1, reused: 1 });
    expect(second.calls).toEqual([['điều khoản riêng']]);
  });

  it('rejects a vector with the wrong dimension before writing anything', async () => {
    const db = drizzle(pg) as unknown as Db;
    const documentId = await seedDocument('e', ['một']);

    await expect(
      embedDocumentChunks({ db, documentId, embed: async () => [[1, 2]], dim: 4 }),
    ).rejects.toThrow(/embed_dim_mismatch/);

    const [row] = (
      await pg.query<{ count: number }>(
        'select count(*)::int as count from chunks where embed_model is not null',
      )
    ).rows;
    expect(row?.count).toBe(0);
  });
});
