import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWatchlistCheck, type WatchlistRunnerStore } from './watchlist-run';

function memoryStore() {
  const snapshots = new Map<string, { contentHash: string; text: string }>();
  const changes: unknown[] = [];
  const notifications: string[] = [];
  const store: WatchlistRunnerStore = {
    entries: async () => [{ id: 'w1', query: 'Luật', sources: ['https://vbpl.vn/a'] }],
    snapshot: async (watchlistId, url) => snapshots.get(`${watchlistId}:${url}`) ?? null,
    saveSnapshot: async ({ watchlistId, url, text, contentHash }) => {
      const saved = { contentHash: contentHash ?? text, text };
      snapshots.set(`${watchlistId}:${url}`, saved);
      return saved;
    },
    recordChange: async (input) => {
      changes.push(input);
      return String(changes.length);
    },
    notify: async (input) => {
      if (notifications.includes(`${input.channel}:${input.digest}`)) return false;
      notifications.push(`${input.channel}:${input.digest}`);
      return true;
    },
    touchSeen: async () => {},
  };
  return { store, snapshots, changes, notifications };
}

describe('một lượt quét watchlist', () => {
  let pages: string[];
  const read = vi.fn(async () => ({
    ok: true as const,
    title: 'Luật doanh nghiệp',
    text: pages[0] ?? '',
  }));

  beforeEach(() => {
    pages = ['Điều 1\nĐiều 2'];
    read.mockClear();
  });

  it('lần đầu chỉ lưu mốc, không báo thay đổi', async () => {
    const { store, changes } = memoryStore();
    const summary = await runWatchlistCheck({ store, read });

    expect(summary).toEqual({ checked: 1, changed: 0, notified: 0, failed: 0 });
    expect(changes).toHaveLength(0);
  });

  it('đổi nội dung thì ghi một thay đổi và báo một lần mỗi kênh', async () => {
    const { store, changes, notifications } = memoryStore();
    await runWatchlistCheck({ store, read });

    pages = ['Điều 1\nĐiều 2 sửa'];
    const telegram = vi.fn<(text: string) => Promise<boolean>>(async () => true);
    const summary = await runWatchlistCheck({ store, read, notifyTelegram: telegram });

    expect(summary.changed).toBe(1);
    expect(summary.notified).toBe(1);
    expect(changes).toHaveLength(1);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.startsWith('in_app:')).toBe(true);
    expect(telegram).toHaveBeenCalledTimes(1);
    expect(telegram.mock.calls[0]?.[0]).toContain('Điều 2 sửa');
  });

  it('chạy lại cùng nội dung không sinh thay đổi hay thông báo mới', async () => {
    const { store, changes, notifications } = memoryStore();
    await runWatchlistCheck({ store, read });
    pages = ['Điều 1\nĐiều 2 sửa'];
    await runWatchlistCheck({ store, read });

    const summary = await runWatchlistCheck({ store, read });
    expect(summary.changed).toBe(0);
    expect(changes).toHaveLength(1);
    expect(notifications).toHaveLength(1);
  });

  it('nguồn lỗi không làm hỏng lượt quét', async () => {
    const { store } = memoryStore();
    const summary = await runWatchlistCheck({
      store,
      read: async () => ({ ok: false, reason: 'timeout' }),
    });
    expect(summary).toEqual({ checked: 1, changed: 0, notified: 0, failed: 1 });
  });
});
