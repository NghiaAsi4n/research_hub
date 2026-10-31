import { sha256Hex } from './ingest';

// So sánh nội dung cho watchlist (Giai đoạn 4, T2).
//
// Mỗi lần quét, văn bản được chuẩn hoá (gộp khoảng trắng, bỏ dòng rỗng) rồi băm. Chỉ khi hash đổi
// mới dựng diff, nên chạy lại cùng một trang không sinh thay đổi giả.

export const MAX_DIFF_LINES = 20;
export const MAX_SNAPSHOT_CHARS = 200_000;
export const MAX_WATCH_SOURCES = 10;

export type WatchlistDiff = {
  added: string[];
  removed: string[];
  addedCount: number;
  removedCount: number;
};

export function normalizeWatchText(text: string): string {
  return text
    .slice(0, MAX_SNAPSHOT_CHARS)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
}

export function watchTextHash(text: string): string {
  return sha256Hex(normalizeWatchText(text));
}

export function diffWatchText(previous: string, next: string): WatchlistDiff {
  const previousLines = new Set(normalizeWatchText(previous).split('\n'));
  const nextLines = new Set(normalizeWatchText(next).split('\n'));
  const addedAll = [...nextLines].filter((line) => !previousLines.has(line));
  const removedAll = [...previousLines].filter((line) => !nextLines.has(line));
  return {
    added: addedAll.slice(0, MAX_DIFF_LINES),
    removed: removedAll.slice(0, MAX_DIFF_LINES),
    addedCount: addedAll.length,
    removedCount: removedAll.length,
  };
}

// Một thay đổi chỉ được báo một lần cho mỗi nội dung: khoá gồm mục theo dõi, URL và hash mới.
export function watchlistDigest(watchlistId: string, url: string, contentHash: string): string {
  return sha256Hex(`${watchlistId}\n${url}\n${contentHash}`);
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseSourceList(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\s+/u) : [];
  const urls: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed === '' || !isHttpUrl(trimmed) || urls.includes(trimmed)) continue;
    urls.push(trimmed);
    if (urls.length >= MAX_WATCH_SOURCES) break;
  }
  return urls;
}
