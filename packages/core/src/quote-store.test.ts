import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { createQuotesStore } from './quote-store';

const pg = new PGlite();
const db = drizzle(pg) as unknown as Db;

beforeAll(async () => {
  await pg.exec(`
    create table quotes (
      symbol text not null,
      ts timestamptz not null,
      open real, high real, low real, close real, volume real,
      source text not null
    );
    create unique index quotes_symbol_ts_source_idx on quotes (symbol, ts, source);
  `);
});

beforeEach(async () => {
  await pg.exec('truncate quotes');
});

afterAll(() => pg.close());

describe('lưu chuỗi giá', () => {
  it('chạy lại cùng ngày thì cập nhật, không nhân đôi', async () => {
    const store = createQuotesStore(db);
    const base = {
      symbol: 'VNINDEX',
      ts: new Date('2026-11-02T00:00:00Z'),
      open: null,
      high: null,
      low: null,
      volume: 1,
      source: 'ssi',
    };

    await store.upsertMany([{ ...base, close: 1280 }]);
    await store.upsertMany([{ ...base, close: 1285.4 }]);

    const rows = await store.latestSeries(['VNINDEX']);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.close).toBeCloseTo(1285.4);
  });

  it('trả tối đa số phiên mỗi mã, mới nhất trước', async () => {
    const store = createQuotesStore(db);
    const day = (d: number, close: number) => ({
      symbol: 'FPT',
      ts: new Date(Date.UTC(2026, 10, d)),
      open: null,
      high: null,
      low: null,
      close,
      volume: null,
      source: 'ssi',
    });
    await store.upsertMany([day(1, 70), day(2, 71), day(3, 72)]);

    const rows = await store.latestSeries(['FPT'], 2);
    expect(rows.map((row) => row.close)).toEqual([72, 71]);
  });
});
