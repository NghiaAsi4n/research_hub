import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { escapeLike, globalSearch, snippetAround } from './global-search';

const pg = new PGlite();
const db = drizzle(pg) as unknown as Db;

beforeAll(async () => {
  await pg.exec(`
    create table documents (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      status text not null default 'ready',
      created_at timestamptz not null default now()
    );
    create table notes (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      body_md text not null default '',
      doc_id uuid,
      updated_at timestamptz not null default now()
    );
    create table chunks (
      id uuid primary key default gen_random_uuid(),
      document_id uuid not null references documents(id) on delete cascade,
      ord integer not null,
      text text not null
    );
  `);
});

afterAll(() => pg.close());

beforeEach(async () => {
  await pg.exec('truncate documents, notes cascade');
});

describe('tìm kiếm toàn cục', () => {
  it('escape ký tự đại diện và cắt đoạn quanh từ khoá', () => {
    expect(escapeLike('100%_x')).toBe('100\\%\\_x');
    const snippet = snippetAround(`${'mở đầu '.repeat(20)}điều kiện thành lập`, 'thành lập', 40);
    expect(snippet).toContain('thành lập');
    expect(snippet.startsWith('…')).toBe(true);
  });

  it('trả đúng loại tài liệu, ghi chú và đoạn văn', async () => {
    const [document] = (
      await pg.query<{ id: string }>(
        `insert into documents (title) values ('Luật doanh nghiệp 2020') returning id`,
      )
    ).rows;
    await pg.query(
      `insert into notes (title, body_md, doc_id) values ('Điều kiện thành lập', 'Điều kiện thành lập doanh nghiệp: vốn và ngành nghề', $1)`,
      [document?.id],
    );
    await pg.query(
      `insert into chunks (document_id, ord, text) values ($1, 0, 'Doanh nghiệp tư nhân do một cá nhân làm chủ')`,
      [document?.id],
    );

    const hits = await globalSearch({ query: 'doanh nghiệp', db });
    expect(hits.map((hit) => hit.kind).sort()).toEqual(['chunk', 'document', 'note']);
    expect(hits.find((hit) => hit.kind === 'document')?.href).toContain('/library/');
    expect(hits.find((hit) => hit.kind === 'note')?.href).toContain('/notes?note=');

    expect(await globalSearch({ query: '  ', db })).toEqual([]);
    expect(await globalSearch({ query: 'không-tồn-tại', db })).toEqual([]);
  });
});
