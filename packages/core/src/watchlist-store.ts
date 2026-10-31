import { desc, eq, sql } from 'drizzle-orm';
import { type Db, getDb } from './db/client';
import { changes, notifications, watchlist, watchlistSnapshots } from './db/schema';
import {
  diffWatchText,
  normalizeWatchText,
  parseSourceList,
  type WatchlistDiff,
  watchTextHash,
} from './watchlist';

// Lưu trữ watchlist: mục theo dõi, snapshot nội dung, thay đổi và sổ thông báo (Giai đoạn 4, T2).

export type WatchlistEntry = {
  id: string;
  query: string | null;
  sources: string[];
  cadence: string;
  lastSeenAt: Date | null;
};

export type StoredChange = {
  id: string;
  watchlistId: string;
  query: string | null;
  diff: {
    url?: string;
    title?: string;
    added?: string[];
    removed?: string[];
    addedCount?: number;
    removedCount?: number;
  } | null;
  createdAt: Date;
};

export type NotificationRow = {
  id: string;
  kind: string;
  channel: string;
  payload: Record<string, unknown> | null;
  readAt: Date | null;
  sentAt: Date;
};

function sourcesOf(value: unknown): string[] {
  return parseSourceList(value);
}

export function createWatchlistStore(db?: Db) {
  const handle = () => (db ??= getDb());

  return {
    async entries(): Promise<WatchlistEntry[]> {
      const rows = await handle()
        .select({
          id: watchlist.id,
          query: watchlist.query,
          sources: watchlist.sources,
          cadence: watchlist.cadence,
          lastSeenAt: watchlist.lastSeenAt,
        })
        .from(watchlist)
        .orderBy(desc(watchlist.lastSeenAt));
      return rows.map((row) => ({ ...row, sources: sourcesOf(row.sources) }));
    },

    async add(input: { query?: string | null; sources: string[] }): Promise<WatchlistEntry> {
      const sources = parseSourceList(input.sources);
      if (sources.length === 0) throw new Error('Cần ít nhất một URL http(s) hợp lệ');
      const [row] = await handle()
        .insert(watchlist)
        .values({ query: input.query?.trim() || null, sources, cadence: 'daily' })
        .returning({
          id: watchlist.id,
          query: watchlist.query,
          sources: watchlist.sources,
          cadence: watchlist.cadence,
          lastSeenAt: watchlist.lastSeenAt,
        });
      if (row === undefined) throw new Error('Không tạo được mục theo dõi');
      return { ...row, sources: sourcesOf(row.sources) };
    },

    async remove(id: string): Promise<boolean> {
      // Thông báo không có khoá ngoại tới watchlist, nên xoá kèm để chuông không còn bản tin mồ côi.
      await handle()
        .delete(notifications)
        .where(sql`${notifications.payload}->>'watchlistId' = ${id}`);
      const rows = await handle()
        .delete(watchlist)
        .where(eq(watchlist.id, id))
        .returning({ id: watchlist.id });
      return rows.length > 0;
    },

    async snapshot(watchlistId: string, url: string) {
      const [row] = await handle()
        .select({
          contentHash: watchlistSnapshots.contentHash,
          text: watchlistSnapshots.text,
        })
        .from(watchlistSnapshots)
        .where(
          sql`${watchlistSnapshots.watchlistId} = ${watchlistId} and ${watchlistSnapshots.url} = ${url}`,
        );
      return row ?? null;
    },

    async saveSnapshot(input: {
      watchlistId: string;
      url: string;
      text: string;
      contentHash?: string;
    }): Promise<{ contentHash: string; text: string }> {
      const text = normalizeWatchText(input.text);
      const contentHash = input.contentHash ?? watchTextHash(text);
      await handle()
        .insert(watchlistSnapshots)
        .values({ watchlistId: input.watchlistId, url: input.url, contentHash, text })
        .onConflictDoUpdate({
          target: [watchlistSnapshots.watchlistId, watchlistSnapshots.url],
          set: { contentHash, text, checkedAt: new Date() },
        });
      return { contentHash, text };
    },

    async recordChange(input: {
      watchlistId: string;
      diff: WatchlistDiff & { url: string; title: string };
    }): Promise<string> {
      const [row] = await handle()
        .insert(changes)
        .values({ watchlistId: input.watchlistId, diff: input.diff })
        .returning({ id: changes.id });
      if (row === undefined) throw new Error('Không ghi được thay đổi');
      return row.id;
    },

    // Sổ thông báo khử trùng theo (kind, channel, payload_digest): lần gửi thứ hai trả false.
    async notify(input: {
      kind: string;
      channel: string;
      digest: string;
      payload: Record<string, unknown>;
    }): Promise<boolean> {
      const rows = await handle()
        .insert(notifications)
        .values({
          kind: input.kind,
          channel: input.channel,
          payloadDigest: input.digest,
          payload: input.payload,
        })
        .onConflictDoNothing()
        .returning({ id: notifications.id });
      return rows.length > 0;
    },

    async changes(limit = 30): Promise<StoredChange[]> {
      return handle()
        .select({
          id: changes.id,
          watchlistId: changes.watchlistId,
          query: watchlist.query,
          diff: changes.diff,
          createdAt: changes.createdAt,
        })
        .from(changes)
        .innerJoin(watchlist, eq(changes.watchlistId, watchlist.id))
        .orderBy(desc(changes.createdAt))
        .limit(limit);
    },

    async notifications(limit = 30): Promise<NotificationRow[]> {
      return handle()
        .select({
          id: notifications.id,
          kind: notifications.kind,
          channel: notifications.channel,
          payload: notifications.payload,
          readAt: notifications.readAt,
          sentAt: notifications.sentAt,
        })
        .from(notifications)
        .orderBy(desc(notifications.sentAt))
        .limit(limit);
    },

    async markRead(id: string): Promise<boolean> {
      const rows = await handle()
        .update(notifications)
        .set({ readAt: new Date() })
        .where(eq(notifications.id, id))
        .returning({ id: notifications.id });
      return rows.length > 0;
    },

    async touchSeen(id: string): Promise<void> {
      await handle().update(watchlist).set({ lastSeenAt: new Date() }).where(eq(watchlist.id, id));
    },
  };
}

export type WatchlistStore = ReturnType<typeof createWatchlistStore>;

export { diffWatchText, watchTextHash };
