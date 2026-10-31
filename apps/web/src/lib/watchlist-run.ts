import {
  diffWatchText,
  normalizeWatchText,
  watchlistDigest,
  watchTextHash,
} from '@research-hub/core/watchlist';

// Một lượt quét watchlist (Giai đoạn 4, T2).
//
// Tách khỏi route để test được bằng store giả và bộ đọc giả: lần đầu lưu snapshot, các lần sau chỉ
// ghi `changes` khi hash đổi, và thông báo khử trùng ở tầng store.

export type WatchlistRunnerEntry = {
  id: string;
  query: string | null;
  sources: string[];
};

export type WatchlistReaderResult =
  | { ok: true; title: string; text: string }
  | { ok: false; reason: string };

export type WatchlistRunnerStore = {
  entries(): Promise<WatchlistRunnerEntry[]>;
  snapshot(watchlistId: string, url: string): Promise<{ contentHash: string; text: string } | null>;
  saveSnapshot(input: {
    watchlistId: string;
    url: string;
    text: string;
    contentHash?: string;
  }): Promise<{ contentHash: string; text: string }>;
  recordChange(input: {
    watchlistId: string;
    diff: {
      url: string;
      title: string;
      added: string[];
      removed: string[];
      addedCount: number;
      removedCount: number;
    };
  }): Promise<string>;
  notify(input: {
    kind: string;
    channel: string;
    digest: string;
    payload: Record<string, unknown>;
  }): Promise<boolean>;
  touchSeen(id: string): Promise<void>;
};

export type WatchlistRunSummary = {
  checked: number;
  changed: number;
  notified: number;
  failed: number;
};

export function telegramSummary(input: {
  title: string;
  url: string;
  addedCount: number;
  removedCount: number;
  added: string[];
}): string {
  const lines = [
    `Watchlist: "${input.title}" đã thay đổi`,
    `${input.url}`,
    `+${input.addedCount} dòng mới, -${input.removedCount} dòng bỏ`,
  ];
  if (input.added.length > 0) {
    lines.push('', ...input.added.slice(0, 5).map((line) => `• ${line.slice(0, 200)}`));
  }
  return lines.join('\n');
}

export async function runWatchlistCheck(input: {
  store: WatchlistRunnerStore;
  read: (url: string) => Promise<WatchlistReaderResult>;
  notifyTelegram?: (text: string) => Promise<boolean>;
}): Promise<WatchlistRunSummary> {
  const summary: WatchlistRunSummary = { checked: 0, changed: 0, notified: 0, failed: 0 };
  const entries = await input.store.entries();

  for (const entry of entries) {
    for (const url of entry.sources) {
      summary.checked += 1;
      const page = await input.read(url);
      if (!page.ok) {
        summary.failed += 1;
        continue;
      }

      const text = normalizeWatchText(page.text);
      const contentHash = watchTextHash(text);
      const previous = await input.store.snapshot(entry.id, url);

      if (previous !== null && previous.contentHash === contentHash) {
        continue;
      }

      await input.store.saveSnapshot({ watchlistId: entry.id, url, text, contentHash });
      if (previous === null) continue;

      const diff = diffWatchText(previous.text, text);
      if (diff.addedCount === 0 && diff.removedCount === 0) continue;

      const title = page.title || url;
      const digest = watchlistDigest(entry.id, url, contentHash);
      await input.store.recordChange({ watchlistId: entry.id, diff: { ...diff, url, title } });
      summary.changed += 1;

      const payload = {
        watchlistId: entry.id,
        query: entry.query,
        url,
        title,
        added: diff.added,
        removed: diff.removed,
        addedCount: diff.addedCount,
        removedCount: diff.removedCount,
      };
      const inApp = await input.store.notify({
        kind: 'watchlist',
        channel: 'in_app',
        digest,
        payload,
      });
      let delivered = inApp;
      if (input.notifyTelegram !== undefined) {
        const message = telegramSummary({
          title,
          url,
          addedCount: diff.addedCount,
          removedCount: diff.removedCount,
          added: diff.added,
        });
        delivered = (await input.notifyTelegram(message)) || delivered;
      }
      if (delivered) summary.notified += 1;
    }
    await input.store.touchSeen(entry.id);
  }

  return summary;
}
