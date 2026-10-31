import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_TABLE_ORDER,
  backupCounts,
  backupObjectKey,
  buildBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
} from './backup';
import type { Db } from './db/client';

const pg = new PGlite();
const db = drizzle(pg) as unknown as Db;

beforeAll(async () => {
  await pg.exec(`
    create table notes (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      body_md text not null default '',
      doc_id uuid,
      tags jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table note_links (
      from_note uuid not null references notes(id) on delete cascade,
      to_note uuid not null references notes(id) on delete cascade,
      unique (from_note, to_note)
    );
  `);
});

afterAll(() => pg.close());

beforeEach(async () => {
  await pg.exec('truncate notes cascade');
});

describe('export dữ liệu', () => {
  it('không đưa bảng cấu hình và bảng hạ tầng vào danh sách export', () => {
    expect(BACKUP_TABLE_ORDER).not.toContain('settings');
    expect(BACKUP_TABLE_ORDER).not.toContain('quotes');
    expect(BACKUP_TABLE_ORDER).not.toContain('ollama_queue_requests');
    expect(BACKUP_TABLE_ORDER).not.toContain('ollama_slots');
  });

  it('xuất đúng số dòng và không chứa chuỗi khoá', async () => {
    const [target] = (
      await pg.query<{ id: string }>(
        `insert into notes (title, body_md) values ('A', '#luật') returning id`,
      )
    ).rows;
    await pg.query(`insert into notes (title) values ('B')`);
    await pg.query(`insert into note_links (from_note, to_note) values ($1, $1)`, [target?.id]);

    const payload = await buildBackup(db, ['notes', 'note_links']);
    expect(payload.version).toBe(1);
    expect(backupCounts(payload)).toEqual({ notes: 2, note_links: 1 });

    const raw = serializeBackup(payload);
    expect(raw).not.toContain('settings');
    expect(raw).not.toContain('API_KEY');
    expect(JSON.parse(raw).tables.notes[0]).not.toHaveProperty('apiKey');
  });

  it('khôi phục lại đúng dữ liệu sau khi bảng rỗng', async () => {
    await pg.query(
      `insert into notes (title, body_md, tags) values ('A', 'nội dung', '["luật"]'::jsonb)`,
    );
    const payload = await buildBackup(db, ['notes']);

    await pg.exec('truncate notes cascade');
    const counts = await restoreBackup(db, payload);
    expect(counts.notes).toBe(1);

    const rows = (
      await pg.query<{ title: string; tags: string[] }>('select title, tags from notes')
    ).rows;
    expect(rows).toEqual([{ title: 'A', tags: ['luật'] }]);

    // Chạy lại không nhân đôi bản ghi.
    await restoreBackup(db, payload);
    expect((await pg.query('select id from notes')).rows).toHaveLength(1);
  });

  it('từ chối file khác phiên bản và khoá object theo ngày UTC', () => {
    expect(() => parseBackup(JSON.stringify({ version: 99, tables: {} }))).toThrow(/Phiên bản/);
    expect(backupObjectKey(new Date('2026-10-31T18:30:00Z'))).toBe('backups/2026-10-31.json.gz');
  });
});
