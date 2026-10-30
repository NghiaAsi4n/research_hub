import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chunkMarkdown } from './chunk';
import { createChunkStore } from './chunk-store';
import type { Db } from './db/client';

// PGlite không có pgvector nên bảng `chunks` ở đây giữ đúng tên cột như migration thật, riêng
// `embedding` dùng kiểu text; store chỉ đọc/ghi ord, text, token_count và embed_model nên phần
// cần kiểm tra vẫn là mã thật.

const pg = new PGlite();

beforeAll(async () => {
  await pg.exec(`
    create table documents (
      id uuid primary key default gen_random_uuid(),
      source_id uuid,
      title text not null,
      storage_key text not null,
      hash text not null,
      status text default 'pending' not null,
      bytes integer,
      pages integer,
      meta jsonb,
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
      embedding text
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
  'Bên cho thuê bàn giao nhà kèm trang thiết bị đã thỏa thuận.',
  '',
  '## Chấm dứt',
  '',
  'Hợp đồng chấm dứt khi hết thời hạn thuê.',
].join('\n');

async function seedDocument(): Promise<string> {
  const [row] = (
    await pg.query<{ id: string }>(
      `insert into documents (title, storage_key, hash, status)
       values ('Hợp đồng thuê nhà', 'documents/test.md', $1, 'ready') returning id`,
      ['c'.repeat(64)],
    )
  ).rows;
  if (!row) throw new Error('Seed returned no document');
  return row.id;
}

describe('chunk store', () => {
  it('writes chunks in order and reads them back', async () => {
    const db = drizzle(pg) as unknown as Db;
    const store = createChunkStore(db);
    const documentId = await seedDocument();
    const items = chunkMarkdown(markdown, { maxChars: 200, overlapChars: 0 });

    await store.replace(documentId, items);
    const stored = await store.list(documentId);

    expect(stored.map((chunk) => chunk.ord)).toEqual(items.map((item) => item.ord));
    expect(stored.map((chunk) => chunk.text)).toEqual(items.map((item) => item.text));
    expect(stored[0]?.tokenCount).toBeGreaterThan(0);
    expect(stored.every((chunk) => chunk.embedModel === null)).toBe(true);
  });

  it('is idempotent and drops chunks left over from a longer previous split', async () => {
    const db = drizzle(pg) as unknown as Db;
    const store = createChunkStore(db);
    const documentId = await seedDocument();

    await store.replace(documentId, chunkMarkdown(markdown, { maxChars: 120, overlapChars: 0 }));
    const firstCount = (await store.list(documentId)).length;
    expect(firstCount).toBeGreaterThan(1);

    await store.replace(documentId, chunkMarkdown(markdown, { maxChars: 120, overlapChars: 0 }));
    expect((await store.list(documentId)).length).toBe(firstCount);

    const shorter = chunkMarkdown(markdown.split('\n\n')[0] ?? '', { maxChars: 120 });
    await store.replace(documentId, shorter);
    const after = await store.list(documentId);
    expect(after.map((chunk) => chunk.ord)).toEqual(shorter.map((item) => item.ord));

    await store.replace(documentId, []);
    expect(await store.list(documentId)).toEqual([]);
  });

  it('clears the stale embed model only for chunks whose text changed', async () => {
    const db = drizzle(pg) as unknown as Db;
    const store = createChunkStore(db);
    const documentId = await seedDocument();
    await store.replace(documentId, chunkMarkdown(markdown, { maxChars: 200, overlapChars: 0 }));
    await pg.query("update chunks set embed_model = 'qwen3-embedding' where document_id = $1", [
      documentId,
    ]);
    const before = await store.list(documentId);

    const changed = chunkMarkdown(`${markdown}\n\nĐiều khoản bổ sung về phạt vi phạm.`, {
      maxChars: 200,
      overlapChars: 0,
    });
    await store.replace(documentId, changed);

    const after = await store.list(documentId);
    const previousByOrd = new Map(before.map((chunk) => [chunk.ord, chunk.text]));
    const kept = after.filter((chunk) => previousByOrd.get(chunk.ord) === chunk.text);
    const touched = after.filter((chunk) => previousByOrd.get(chunk.ord) !== chunk.text);

    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((chunk) => chunk.embedModel === 'qwen3-embedding')).toBe(true);
    expect(touched.every((chunk) => chunk.embedModel === null)).toBe(true);
  });

  it('removes chunks together with their document', async () => {
    const db = drizzle(pg) as unknown as Db;
    const store = createChunkStore(db);
    const documentId = await seedDocument();
    await store.replace(documentId, chunkMarkdown(markdown, { maxChars: 200, overlapChars: 0 }));

    await pg.query('delete from documents where id = $1', [documentId]);

    const [row] = (await pg.query<{ count: number }>('select count(*)::int as count from chunks'))
      .rows;
    expect(row?.count).toBe(0);
  });
});
