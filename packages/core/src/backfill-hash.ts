import { sql } from 'drizzle-orm';
import { hashContentChunks } from './content-hash';
import type { Db } from './db/client';
import { getDb } from './db/client';
import { getObjectChunks, markdownKeyFor } from './storage';

// Backfill nội dung cho các tài liệu `ready` có từ trước T9 (Giai đoạn 1, T9).
//
// Trước T9, `documents.hash` là hash của nguồn (URL hoặc tên file), nên cùng một nội dung có thể
// nằm dưới nhiều hash. Hàm dưới đây đọc Markdown sạch trong Object Storage, băm nội dung, rồi gọi
// `rh_backfill_document_hash` để đổi khoá và gộp bản trùng. Hàm SQL làm việc gộp trong một
// transaction, nên lần chạy lại chỉ trả về `unchanged`.
//
// Chạy theo lô có con trỏ (created_at, id) để không phải tải cả bảng vào bộ nhớ. Chỉ đọc, không
// xoá object: bản Markdown vẫn là nguồn sự thật sau khi đổi hash.

export type BackfillAction = 'updated' | 'merged' | 'unchanged' | 'skipped';

export type BackfillCursor = { createdAt: string; id: string };

export type BackfillItem = {
  documentId: string;
  status: BackfillAction;
  hash?: string;
  canonicalId?: string;
  reason?: string;
};

export type BackfillReport = {
  dryRun: boolean;
  scanned: number;
  updated: number;
  merged: number;
  unchanged: number;
  skipped: number;
  items: BackfillItem[];
  nextCursor: BackfillCursor | null;
  remaining: boolean;
};

type Row = {
  id: string;
  storage_key: string;
  hash: string;
  created_at: string | Date;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(value), 1), MAX_LIMIT);
}

function toIso(value: string | Date): string {
  // `neon-http` trả timestamp đã chuẩn hoá, còn PGlite trả chuỗi theo múi giờ phiên.
  // Chuẩn hoá cả hai về ISO để con trỏ dùng lại được giữa hai driver.
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export async function backfillContentHashes(input?: {
  db?: Db;
  limit?: number;
  dryRun?: boolean;
  cursor?: BackfillCursor;
  hashMarkdown?: (storageKey: string) => Promise<string>;
}): Promise<BackfillReport> {
  const db = input?.db ?? getDb();
  const limit = clampLimit(input?.limit);
  const dryRun = input?.dryRun ?? false;
  const cursor = input?.cursor;
  const hashMarkdown =
    input?.hashMarkdown ??
    ((storageKey: string) => hashContentChunks(getObjectChunks(markdownKeyFor(storageKey))));

  const rows = await db.execute(sql`
    select id, storage_key, hash, created_at
    from documents
    where status = 'ready'
    ${
      cursor
        ? sql`and (created_at, id) > (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
        : sql``
    }
    order by created_at asc, id asc
    limit ${limit + 1}
  `);
  const page = (rows.rows as Row[]).slice(0, limit);

  const items: BackfillItem[] = [];
  let updated = 0;
  let merged = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const row of page) {
    let hash: string;
    try {
      hash = await hashMarkdown(row.storage_key);
    } catch {
      skipped += 1;
      items.push({ documentId: row.id, status: 'skipped', reason: 'markdown_unreadable' });
      continue;
    }
    if (hash === row.hash) {
      unchanged += 1;
      items.push({ documentId: row.id, status: 'unchanged', hash });
      continue;
    }
    if (dryRun) {
      updated += 1;
      items.push({ documentId: row.id, status: 'updated', hash });
      continue;
    }
    const result = await db.execute(
      sql`select rh_backfill_document_hash(${row.id}::uuid, ${hash}) as canonical`,
    );
    const canonical = (result.rows[0] as { canonical: string | null } | undefined)?.canonical;
    if (!canonical) {
      skipped += 1;
      items.push({ documentId: row.id, status: 'skipped', reason: 'canonical_not_ready' });
      continue;
    }
    if (canonical === row.id) {
      updated += 1;
      items.push({ documentId: row.id, status: 'updated', hash });
    } else {
      merged += 1;
      items.push({ documentId: row.id, status: 'merged', hash, canonicalId: canonical });
    }
  }

  const last = page.at(-1);
  return {
    dryRun,
    scanned: page.length,
    updated,
    merged,
    unchanged,
    skipped,
    items,
    nextCursor: last ? { createdAt: toIso(last.created_at), id: last.id } : null,
    remaining: rows.rows.length > limit,
  };
}
