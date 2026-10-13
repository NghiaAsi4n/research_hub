import { describe, expect, it } from 'vitest';
import { buildStorageKey } from './storage';

describe('buildStorageKey', () => {
  it('ghép khoá theo kind/năm/tháng và giữ phần mở rộng', () => {
    const key = buildStorageKey('documents', 'Hop dong.pdf', new Date('2026-10-13T00:00:00Z'));
    expect(key.startsWith('documents/2026/10/')).toBe(true);
    expect(key.endsWith('.pdf')).toBe(true);
  });

  it('không để tên file tạo thêm thư mục', () => {
    const key = buildStorageKey('documents', '../../etc/passwd');
    expect(key.split('/')).toHaveLength(4);
  });

  it('giữ khoá trong đúng nhánh kind được truyền vào', () => {
    const key = buildStorageKey('media', 'anh.png', new Date('2026-01-05T00:00:00Z'));
    expect(key.startsWith('media/2026/01/')).toBe(true);
  });
});
