import { describe, expect, it } from 'vitest';
import { storageAccessVerdict } from './storage-access';

describe('kết luận quyền truy cập bucket', () => {
  it('chỉ đạt khi policy kín và đọc ẩn danh bị chặn', () => {
    expect(
      storageAccessVerdict({
        bucket: 'research-hub-media',
        publicPolicy: false,
        anonymousListBlocked: true,
      }).ok,
    ).toBe(true);
    expect(
      storageAccessVerdict({ bucket: 'b', publicPolicy: true, anonymousListBlocked: true }).ok,
    ).toBe(false);
    expect(
      storageAccessVerdict({ bucket: 'b', publicPolicy: false, anonymousListBlocked: false }).ok,
    ).toBe(false);
  });

  it('không coi giá trị chưa xác định là đạt', () => {
    expect(
      storageAccessVerdict({ bucket: null, publicPolicy: null, anonymousListBlocked: null }).ok,
    ).toBe(false);
  });
});
