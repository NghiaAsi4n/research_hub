import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { createNoteStore, noteLinkTitles, noteTags } from './note-store';

const pg = new PGlite();
const db = drizzle(pg) as unknown as Db;

beforeAll(async () => {
  await pg.exec(`
    create table documents (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      status text not null default 'ready'
    );
    create table notes (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      body_md text not null default '',
      doc_id uuid references documents(id) on delete set null,
      tags jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table note_links (
      from_note uuid not null references notes(id) on delete cascade,
      to_note uuid not null references notes(id) on delete cascade,
      unique (from_note, to_note)
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
  await pg.exec('truncate notes, documents cascade');
});

describe('phân tích nội dung ghi chú', () => {
  it('lấy liên kết wiki, bỏ trùng và bỏ qua khối mã', () => {
    expect(noteLinkTitles('Xem [[Ghi chú B]] rồi [[ghi chú b]].\n```\n[[trong mã]]\n```')).toEqual([
      'Ghi chú B',
    ]);
  });

  it('lấy tag, bỏ qua tiêu đề Markdown và số thuần', () => {
    expect(
      noteTags('# Tiêu đề\nNội dung #luật và #Hợp-Đồng #2024\n```\n#khong-phai-tag\n```'),
    ).toEqual(['luật', 'hợp-đồng']);
  });
});

describe('ghi chú và liên kết hai chiều', () => {
  it('tạo liên kết xuôi và backlink ngược', async () => {
    const store = createNoteStore(db);
    const b = await store.create({ title: 'Ghi chú B', bodyMd: 'nội dung B' });
    const a = await store.create({
      title: 'Ghi chú A',
      bodyMd: 'Xem thêm [[Ghi chú B]] về #luật.',
    });

    expect(a.tags).toEqual(['luật']);
    expect(a.outgoing).toEqual([{ id: b.id, title: 'Ghi chú B' }]);

    const readB = await store.read(b.id);
    expect(readB?.backlinks).toEqual([{ id: a.id, title: 'Ghi chú A' }]);
  });

  it('sửa nội dung thì liên kết cũ biến mất', async () => {
    const store = createNoteStore(db);
    const b = await store.create({ title: 'Ghi chú B' });
    const a = await store.create({ title: 'Ghi chú A', bodyMd: '[[Ghi chú B]]' });

    await store.update(a.id, { bodyMd: 'không còn liên kết' });

    expect((await store.read(b.id))?.backlinks).toEqual([]);
  });

  it('lọc danh sách theo tag', async () => {
    const store = createNoteStore(db);
    await store.create({ title: 'Một', bodyMd: '#luật' });
    await store.create({ title: 'Hai', bodyMd: '#kinh-tế' });

    expect((await store.list('luật')).map((note) => note.title)).toEqual(['Một']);
    expect((await store.list()).length).toBe(2);
  });

  it('chèn trích dẫn từ chat thành ghi chú có nguồn và tag', async () => {
    const store = createNoteStore(db);
    const {
      rows: [document],
    } = await pg.query<{ id: string }>(
      `insert into documents (title) values ('Luật doanh nghiệp') returning id`,
    );
    const {
      rows: [chunk],
    } = await pg.query<{ id: string }>(
      `insert into chunks (document_id, ord, text) values ($1, 4, '  Điều  một   nội dung  ')
       returning id`,
      [document?.id],
    );

    const note = await store.createFromChunk(chunk?.id ?? '');

    expect(note?.docId).toBe(document?.id);
    expect(note?.bodyMd).toContain('> Điều một nội dung');
    expect(note?.bodyMd).toContain('(/library/');
    expect(note?.tags).toEqual(['trích-dẫn']);
  });
});
