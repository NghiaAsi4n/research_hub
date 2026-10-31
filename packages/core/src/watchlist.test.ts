import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { diffWatchText, normalizeWatchText, parseSourceList, watchTextHash } from './watchlist';
import { createWatchlistStore } from './watchlist-store';

const pg = new PGlite();
const db = drizzle(pg) as unknown as Db;

beforeAll(async () => {
  await pg.exec(`
    create table watchlist (
      id uuid primary key default gen_random_uuid(),
      query text,
      sources jsonb,
      cadence text not null default 'daily',
      last_seen_at timestamptz
    );
    create table watchlist_snapshots (
      watchlist_id uuid not null references watchlist(id) on delete cascade,
      url text not null,
      content_hash text not null,
      text text not null,
      checked_at timestamptz not null default now(),
      primary key (watchlist_id, url)
    );
    create table changes (
      id uuid primary key default gen_random_uuid(),
      watchlist_id uuid not null references watchlist(id) on delete cascade,
      diff jsonb,
      created_at timestamptz not null default now()
    );
    create table notifications (
      id uuid primary key default gen_random_uuid(),
      kind text not null,
      channel text not null,
      payload_digest text not null,
      payload jsonb,
      read_at timestamptz,
      sent_at timestamptz not null default now(),
      unique (kind, channel, payload_digest)
    );
  `);
});

afterAll(() => pg.close());

beforeEach(async () => {
  await pg.exec('truncate watchlist, notifications cascade');
});

describe('chuẩn hoá và so sánh nội dung', () => {
  it('gộp khoảng trắng và bỏ dòng rỗng trước khi băm', () => {
    expect(normalizeWatchText('  a   b \r\n\r\nc  ')).toBe('a b\nc');
    expect(watchTextHash('a  b')).toBe(watchTextHash('a b'));
  });

  it('đếm dòng thêm và bớt, giữ tối đa 20 dòng mỗi loại', () => {
    const diff = diffWatchText('một\nhai', 'hai\nba');
    expect(diff).toEqual({ added: ['ba'], removed: ['một'], addedCount: 1, removedCount: 1 });

    const many = Array.from({ length: 30 }, (_, index) => `dòng ${index}`).join('\n');
    const big = diffWatchText('', many);
    expect(big.addedCount).toBe(30);
    expect(big.added.length).toBe(20);
  });

  it('chỉ nhận URL http(s), bỏ trùng và chặn quá 10 nguồn', () => {
    expect(
      parseSourceList(['https://vbpl.vn/a', 'ftp://x', 'https://vbpl.vn/a', 'http://b.vn']),
    ).toEqual(['https://vbpl.vn/a', 'http://b.vn']);
    const many = Array.from({ length: 12 }, (_, index) => `https://x.vn/${index}`);
    expect(parseSourceList(many)).toHaveLength(10);
  });
});

describe('store watchlist', () => {
  it('lưu snapshot theo mục và URL, cập nhật khi quét lại', async () => {
    const store = createWatchlistStore(db);
    const entry = await store.add({ query: 'Luật', sources: ['https://vbpl.vn/a'] });

    await store.saveSnapshot({ watchlistId: entry.id, url: 'https://vbpl.vn/a', text: 'một' });
    const first = await store.snapshot(entry.id, 'https://vbpl.vn/a');
    expect(first?.text).toBe('một');

    await store.saveSnapshot({ watchlistId: entry.id, url: 'https://vbpl.vn/a', text: 'hai' });
    expect((await store.snapshot(entry.id, 'https://vbpl.vn/a'))?.text).toBe('hai');
  });

  it('khử trùng thông báo theo digest và đánh dấu đã đọc', async () => {
    const store = createWatchlistStore(db);
    const payload = { title: 'Luật', addedCount: 1 };

    expect(
      await store.notify({ kind: 'watchlist', channel: 'in_app', digest: 'd1', payload }),
    ).toBe(true);
    expect(
      await store.notify({ kind: 'watchlist', channel: 'in_app', digest: 'd1', payload }),
    ).toBe(false);

    const [row] = await store.notifications();
    expect(row?.readAt).toBeNull();
    expect(await store.markRead(row?.id ?? '')).toBe(true);
    expect((await store.notifications())[0]?.readAt).not.toBeNull();
  });

  it('ghi thay đổi kèm câu gợi nhớ của mục theo dõi', async () => {
    const store = createWatchlistStore(db);
    const entry = await store.add({ query: 'Luật doanh nghiệp', sources: ['https://vbpl.vn/a'] });
    await store.recordChange({
      watchlistId: entry.id,
      diff: {
        url: 'https://vbpl.vn/a',
        title: 'Luật',
        added: ['Điều 5'],
        removed: [],
        addedCount: 1,
        removedCount: 0,
      },
    });

    const [change] = await store.changes();
    expect(change?.query).toBe('Luật doanh nghiệp');
    expect(change?.diff?.added).toEqual(['Điều 5']);
  });
});
