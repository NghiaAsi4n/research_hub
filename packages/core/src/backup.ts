import { getTableColumns } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Db } from './db/client';
import {
  changes,
  chunks,
  citations,
  collectionItems,
  collections,
  documentAliases,
  documentSources,
  documents,
  highlights,
  jobs,
  noteLinks,
  notes,
  notifications,
  readingProgress,
  runSteps,
  runs,
  sources,
  watchlist,
  watchlistSnapshots,
} from './db/schema';

// Export logic dữ liệu để sao lưu (Giai đoạn 4, T3).
//
// Chỉ đọc bảng nghiệp vụ với cột cố định. `settings` không nằm trong danh sách vì đó là chỗ dễ
// lọt khoá cấu hình nhất; vector nhúng và cột `tsv` cũng bỏ vì sinh lại được từ văn bản gốc.

export const BACKUP_VERSION = 1;

export const BACKUP_TABLE_ORDER = [
  'sources',
  'documents',
  'document_sources',
  'document_aliases',
  'reading_progress',
  'highlights',
  'chunks',
  'collections',
  'collection_items',
  'notes',
  'note_links',
  'runs',
  'run_steps',
  'citations',
  'watchlist',
  'watchlist_snapshots',
  'changes',
  'notifications',
  'jobs',
] as const;

export type BackupTable = (typeof BACKUP_TABLE_ORDER)[number];

export type BackupPayload = {
  version: number;
  createdAt: string;
  tables: Partial<Record<BackupTable, unknown[]>>;
};

type Reader = (db: Db) => Promise<unknown[]>;

const READERS: Record<BackupTable, Reader> = {
  sources: async (db) => await db.select().from(sources),
  documents: async (db) => await db.select().from(documents),
  document_sources: async (db) => await db.select().from(documentSources),
  document_aliases: async (db) => await db.select().from(documentAliases),
  reading_progress: async (db) => await db.select().from(readingProgress),
  highlights: async (db) => await db.select().from(highlights),
  // Không lấy `embedding` và `tsv`: vector sinh lại bằng reindex, tsv do trigger/DB dựng.
  chunks: async (db) => {
    const rows = await db
      .select({
        id: chunks.id,
        documentId: chunks.documentId,
        ord: chunks.ord,
        text: chunks.text,
        embedModel: chunks.embedModel,
      })
      .from(chunks)
      .execute();
    return rows as unknown as unknown[];
  },
  collections: async (db) => await db.select().from(collections),
  collection_items: async (db) => await db.select().from(collectionItems),
  notes: async (db) => await db.select().from(notes),
  note_links: async (db) => await db.select().from(noteLinks),
  runs: async (db) => await db.select().from(runs),
  run_steps: async (db) => await db.select().from(runSteps),
  citations: async (db) => await db.select().from(citations),
  watchlist: async (db) => await db.select().from(watchlist),
  watchlist_snapshots: async (db) => await db.select().from(watchlistSnapshots),
  changes: async (db) => await db.select().from(changes),
  notifications: async (db) => await db.select().from(notifications),
  jobs: async (db) => await db.select().from(jobs),
};

const TABLES: Record<BackupTable, PgTable> = {
  sources,
  documents,
  document_sources: documentSources,
  document_aliases: documentAliases,
  reading_progress: readingProgress,
  highlights,
  chunks,
  collections,
  collection_items: collectionItems,
  notes,
  note_links: noteLinks,
  runs,
  run_steps: runSteps,
  citations,
  watchlist,
  watchlist_snapshots: watchlistSnapshots,
  changes,
  notifications,
  jobs,
};

export async function buildBackup(
  db: Db,
  tables: readonly BackupTable[] = BACKUP_TABLE_ORDER,
): Promise<BackupPayload> {
  const exported: Partial<Record<BackupTable, unknown[]>> = {};
  for (const table of tables) {
    exported[table] = await READERS[table](db);
  }
  return { version: BACKUP_VERSION, createdAt: new Date().toISOString(), tables: exported };
}

export function serializeBackup(payload: BackupPayload): string {
  return JSON.stringify(payload);
}

export function parseBackup(raw: string): BackupPayload {
  const parsed = JSON.parse(raw) as Partial<BackupPayload>;
  if (parsed.version !== BACKUP_VERSION) {
    throw new Error(`Phiên bản file export không hỗ trợ: ${String(parsed.version)}`);
  }
  if (typeof parsed.tables !== 'object' || parsed.tables === null) {
    throw new Error('File export thiếu phần tables');
  }
  return {
    version: BACKUP_VERSION,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
    tables: parsed.tables,
  };
}

const RESTORE_BATCH = 200;

// JSON không giữ kiểu Date, nên cột timestamp nhận lại chuỗi ISO. Drizzle cần Date thật để
// chuyển thành tham số, vì vậy chuyển lại theo kiểu cột trước khi insert.
function reviveRow(table: PgTable, input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) return {};
  const row = { ...(input as Record<string, unknown>) };
  const columns = getTableColumns(table);
  for (const [key, column] of Object.entries(columns)) {
    const value = row[key];
    if (typeof value === 'string' && column.dataType === 'date') {
      row[key] = new Date(value);
    }
  }
  return row;
}

export async function restoreBackup(
  db: Db,
  payload: BackupPayload,
): Promise<Record<string, number>> {
  if (payload.version !== BACKUP_VERSION) {
    throw new Error(`Phiên bản file export không hỗ trợ: ${String(payload.version)}`);
  }

  const counts: Record<string, number> = {};
  for (const name of BACKUP_TABLE_ORDER) {
    const rows = payload.tables[name];
    if (rows === undefined || rows.length === 0) {
      counts[name] = 0;
      continue;
    }
    for (let index = 0; index < rows.length; index += RESTORE_BATCH) {
      const batch = rows
        .slice(index, index + RESTORE_BATCH)
        .map((row) => reviveRow(TABLES[name], row));
      await db
        .insert(TABLES[name])
        .values(batch as never)
        .onConflictDoNothing();
    }
    counts[name] = rows.length;
  }
  return counts;
}

export function backupCounts(payload: BackupPayload): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(payload.tables)) {
    if (Array.isArray(rows)) counts[name] = rows.length;
  }
  return counts;
}

export function backupObjectKey(date: Date): string {
  return `backups/${date.toISOString().slice(0, 10)}.json.gz`;
}
