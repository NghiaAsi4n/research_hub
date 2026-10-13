import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { documents, jobs, sources } from './schema';

// Đọc cấu hình bảng từ chính khai báo Drizzle, để test bám theo schema thật thay vì SQL viết tay.
function indexInfo(table: PgTable) {
  return getTableConfig(table).indexes.map((entry) => ({
    name: entry.config.name,
    unique: entry.config.unique,
    columns: entry.config.columns.map(
      (column) => (column as { name?: string }).name ?? String(column),
    ),
  }));
}

function columnNames(table: PgTable) {
  return getTableConfig(table).columns.map((column) => column.name);
}

describe('jobs', () => {
  it('idem_key bắt buộc để chống xử lý trùng', () => {
    const column = getTableConfig(jobs).columns.find((entry) => entry.name === 'idem_key');
    expect(column?.notNull).toBe(true);
  });

  it('có chỉ mục duy nhất trên idem_key', () => {
    expect(indexInfo(jobs)).toContainEqual({
      name: 'jobs_idem_key_idx',
      unique: true,
      columns: ['idem_key'],
    });
  });

  it('có chỉ mục lease để reaper quét job quá hạn', () => {
    expect(indexInfo(jobs).map((entry) => entry.name)).toContain('jobs_lease_expires_at_idx');
  });

  it('giữ đủ cột lease và đếm số lần thử', () => {
    expect(columnNames(jobs)).toEqual(
      expect.arrayContaining(['lease_owner', 'lease_expires_at', 'attempt', 'state']),
    );
  });
});

describe('documents', () => {
  it('ghi được số trang và thời điểm tạo', () => {
    expect(columnNames(documents)).toEqual(expect.arrayContaining(['pages', 'created_at']));
  });

  it('hash duy nhất để chống trùng nội dung', () => {
    expect(indexInfo(documents)).toContainEqual({
      name: 'documents_hash_idx',
      unique: true,
      columns: ['hash'],
    });
  });
});

describe('sources', () => {
  it('ghi được nguồn dạng URL hoặc file', () => {
    expect(columnNames(sources)).toEqual(expect.arrayContaining(['kind', 'url', 'created_at']));
  });
});
