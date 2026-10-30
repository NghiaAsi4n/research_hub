import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { indexDocument } from './index-document';

const pg = new PGlite();

beforeAll(async () => {
  await pg.exec(`
    create domain vector as text;
    create table documents (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      storage_key text not null,
      hash text not null,
      status text default 'ready' not null,
      created_at timestamptz default now() not null
    );
    create table chunks (
      id uuid primary key default gen_random_uuid(),
      document_id uuid not null references documents(id) on delete cascade,
      ord integer not null,
      text text not null,
      token_count integer,
      embed_model text,
      tsv tsvector,
      embedding vector
    );
    create unique index chunks_document_ord_idx on chunks (document_id, ord);
  `);
}, 20_000);

afterAll(() => pg.close());

beforeEach(async () => {
  await pg.exec('truncate chunks, documents restart identity cascade');
});

const markdown = [
  '# Hợp đồng thuê nhà',
  '',
  'Bên thuê thanh toán tiền thuê đúng hạn theo thỏa thuận.',
  '',
  '## Chấm dứt',
  '',
  'Hợp đồng chấm dứt khi hết thời hạn thuê.',
].join('\n');

async function seed(): Promise<string> {
  const [row] = (
    await pg.query<{ id: string }>(
      `insert into documents (title, storage_key, hash) values ('Hợp đồng thuê nhà', 'documents/a.md', 'hash-a') returning id`,
    )
  ).rows;
  if (!row) throw new Error('seed failed');
  return row.id;
}

function fakeEmbedder() {
  const calls: string[][] = [];
  return {
    calls,
    embed: async (texts: string[]) => {
      calls.push(texts);
      return texts.map(() => [1, 2, 3, 4]);
    },
  };
}

describe('indexDocument', () => {
  it('reads Markdown, writes chunks and embeds them', async () => {
    const db = drizzle(pg) as unknown as Db;
    const documentId = await seed();
    const embedder = fakeEmbedder();

    const report = await indexDocument({
      documentId,
      embed: embedder.embed,
      db,
      readMarkdown: async () => markdown,
      dim: 4,
      chunkOptions: { maxChars: 120, overlapChars: 0 },
    });

    expect(report.chunks).toBeGreaterThan(0);
    expect(report).toMatchObject({ embedded: report.chunks, reused: 0, model: 'qwen3-embedding' });
    const [row] = (
      await pg.query<{ count: number }>(
        "select count(*)::int as count from chunks where document_id = $1 and embed_model = 'qwen3-embedding'",
        [documentId],
      )
    ).rows;
    expect(row?.count).toBe(report.chunks);
  });

  it('is idempotent on a second run and reuses every vector', async () => {
    const db = drizzle(pg) as unknown as Db;
    const documentId = await seed();
    await indexDocument({
      documentId,
      embed: fakeEmbedder().embed,
      db,
      readMarkdown: async () => markdown,
      dim: 4,
    });

    const second = fakeEmbedder();
    const report = await indexDocument({
      documentId,
      embed: second.embed,
      db,
      readMarkdown: async () => markdown,
      dim: 4,
    });

    expect(report).toMatchObject({ embedded: 0, reused: report.chunks });
    expect(second.calls).toEqual([]);
    const [row] = (await pg.query<{ count: number }>('select count(*)::int as count from chunks'))
      .rows;
    expect(row?.count).toBe(report.chunks);
  });

  it('fails when the document does not exist', async () => {
    const db = drizzle(pg) as unknown as Db;

    await expect(
      indexDocument({
        documentId: '00000000-0000-4000-8000-000000000000',
        embed: fakeEmbedder().embed,
        db,
        readMarkdown: async () => markdown,
        dim: 4,
      }),
    ).rejects.toThrow(/index_document_not_found/);
  });
});
