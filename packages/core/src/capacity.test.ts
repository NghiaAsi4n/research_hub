import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildCapacityReport,
  CAPACITY_WARNING_RATIO,
  databaseBytes,
  parseQuota,
  resolveQuotas,
} from './capacity';
import type { Db } from './db/client';

const pg = new PGlite();
const db = drizzle(pg) as unknown as Db;

beforeAll(async () => {
  await pg.exec('create table capacity_probe (id integer primary key, note text)');
});

afterAll(() => pg.close());

describe('báo cáo dung lượng', () => {
  it('bật cảnh báo từ 70% và đánh dấu vượt hạn mức', () => {
    expect(CAPACITY_WARNING_RATIO).toBe(0.7);
    const below = buildCapacityReport({
      databaseBytes: 69,
      storageBytes: 0,
      databaseQuotaBytes: 100,
      storageQuotaBytes: 100,
    });
    expect(below.warning).toBe(false);
    expect(below.exceeded).toBe(false);

    const warning = buildCapacityReport({
      databaseBytes: 70,
      storageBytes: 10,
      databaseQuotaBytes: 100,
      storageQuotaBytes: 100,
    });
    expect(warning.warning).toBe(true);
    expect(warning.databaseRatio).toBeCloseTo(0.7);

    const full = buildCapacityReport({
      databaseBytes: 0,
      storageBytes: 101,
      databaseQuotaBytes: 100,
      storageQuotaBytes: 100,
    });
    expect(full.exceeded).toBe(true);
  });

  it('đọc hạn mức từ cấu hình, bỏ giá trị sai và dùng mặc định', () => {
    expect(resolveQuotas({ DB_QUOTA_BYTES: '2048' })).toEqual({
      databaseQuotaBytes: 2048,
      storageQuotaBytes: 1024 * 1024 * 1024,
    });
    expect(parseQuota('0', 512)).toBe(512);
    expect(parseQuota('không-phải-số', 512)).toBe(512);
  });

  it('đo được dung lượng database thật', async () => {
    const bytes = await databaseBytes(db);
    expect(bytes).toBeGreaterThan(0);
  });
});
