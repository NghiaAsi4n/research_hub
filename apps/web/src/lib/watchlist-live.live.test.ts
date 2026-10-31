import { createWatchlistStore } from '@research-hub/core/watchlist-store';
import { readHtml } from '@research-hub/pipeline/read-html';
import { afterAll, describe, expect, it } from 'vitest';
import { runWatchlistCheck } from './watchlist-run';

// Chạy thật với Neon staging và một trang văn bản luật. Bỏ qua khi chưa khai WATCHLIST_LIVE_URL,
// để `pnpm test` trong CI không phụ thuộc mạng.
const url = process.env.WATCHLIST_LIVE_URL;
const live = Boolean(process.env.DATABASE_URL && url);

describe.skipIf(!live)('watchlist chạy thật', () => {
  const store = createWatchlistStore();
  let created: string | null = null;

  afterAll(async () => {
    if (created !== null) {
      await store.remove(created);
    }
  });

  it('lưu mốc lần đầu rồi phát hiện thay đổi khi nội dung đổi', async () => {
    const entry = await store.add({ query: 'Kiểm thử Phase 4', sources: [url as string] });
    created = entry.id;

    const read = async (source: string) => {
      const article = await readHtml(source);
      if (article.kind !== 'ok') return { ok: false as const, reason: article.reason };
      return { ok: true as const, title: article.title, text: article.markdown };
    };

    const first = await runWatchlistCheck({ store, read });
    expect(first.checked).toBe(1);
    expect(first.failed).toBe(0);
    expect(first.changed).toBe(0);

    await store.saveSnapshot({
      watchlistId: entry.id,
      url: url as string,
      text: 'Điều 1. Nội dung cũ dùng để mô phỏng lần quét trước',
    });

    const second = await runWatchlistCheck({ store, read });
    expect(second.changed).toBe(1);

    const changes = await store.changes();
    expect(changes.some((change) => change.watchlistId === entry.id)).toBe(true);

    const inbox = await store.notifications();
    expect(inbox.some((item) => item.payload?.watchlistId === entry.id)).toBe(true);
  }, 180_000);
});
