import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { seedGoldCorpus } from './gold-seed';

const pg = new PGlite();

beforeAll(async () => {
  await pg.exec(`
    create domain vector as text;
    create table documents (
      id uuid primary key default gen_random_uuid(),
      source_id uuid,
      title text not null,
      author text,
      published_at timestamptz,
      storage_key text not null,
      hash text not null,
      status text default 'ready' not null,
      bytes integer,
      pages integer,
      meta jsonb,
      created_at timestamptz default now() not null
    );
    create unique index documents_hash_idx on documents (hash);
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

describe('seedGoldCorpus', () => {
  it('writes the six sample documents with their chunks', async () => {
    const db = drizzle(pg) as unknown as Db;

    const report = await seedGoldCorpus({ db });

    expect(report).toHaveLength(6);
    expect(report.every((entry) => entry.created)).toBe(true);
    expect(report.reduce((sum, entry) => sum + entry.chunks, 0)).toBeGreaterThanOrEqual(6);
    const [row] = (
      await pg.query<{ count: number }>('select count(*)::int as count from documents')
    ).rows;
    expect(row?.count).toBe(6);
  });

  it('is idempotent and reports the existing document on the second run', async () => {
    const db = drizzle(pg) as unknown as Db;
    const first = await seedGoldCorpus({ db });
    const second = await seedGoldCorpus({ db });

    expect(second.every((entry) => !entry.created)).toBe(true);
    expect(second.map((entry) => entry.documentId)).toEqual(first.map((entry) => entry.documentId));
    const [row] = (await pg.query<{ count: number }>('select count(*)::int as count from chunks'))
      .rows;
    expect(row?.count).toBe(first.reduce((sum, entry) => sum + entry.chunks, 0));
  });
});
