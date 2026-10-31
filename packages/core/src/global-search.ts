import { desc, eq, ilike, or } from 'drizzle-orm';
import { type Db, getDb } from './db/client';
import { chunks, documents, notes } from './db/schema';

// Tìm kiếm toàn cục trên tài liệu, ghi chú và đoạn văn (Giai đoạn 4, T5).
//
// Dùng ILIKE có escape thay vì full-text để chạy được cả trên PGlite trong test và trả kết quả
// ngay khi tài liệu chưa được lập chỉ mục đầy đủ.

export type GlobalHitKind = 'document' | 'note' | 'chunk';

export type GlobalHit = {
  kind: GlobalHitKind;
  id: string;
  title: string;
  snippet: string;
  href: string;
};

export const MAX_SEARCH_QUERY_CHARS = 200;

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function snippetAround(text: string, query: string, width = 160): string {
  const plain = text.replace(/\s+/g, ' ').trim();
  const index = plain.toLocaleLowerCase('vi').indexOf(query.toLocaleLowerCase('vi'));
  if (index < 0) return plain.slice(0, width);
  const start = Math.max(0, index - Math.floor(width / 3));
  const slice = plain.slice(start, start + width);
  return `${start > 0 ? '…' : ''}${slice}${start + width < plain.length ? '…' : ''}`;
}

export async function globalSearch(input: {
  query: string;
  limit?: number;
  db?: Db;
}): Promise<GlobalHit[]> {
  const query = input.query.trim().slice(0, MAX_SEARCH_QUERY_CHARS);
  if (query === '') return [];
  const db = input.db ?? getDb();
  const pattern = `%${escapeLike(query)}%`;
  const perSource = Math.max(1, input.limit ?? 10);

  const [documentRows, noteRows, chunkRows] = await Promise.all([
    db
      .select({ id: documents.id, title: documents.title })
      .from(documents)
      .where(ilike(documents.title, pattern))
      .orderBy(desc(documents.createdAt))
      .limit(perSource),
    db
      .select({ id: notes.id, title: notes.title, bodyMd: notes.bodyMd })
      .from(notes)
      .where(or(ilike(notes.title, pattern), ilike(notes.bodyMd, pattern)))
      .orderBy(desc(notes.updatedAt))
      .limit(perSource),
    db
      .select({
        id: chunks.id,
        text: chunks.text,
        ord: chunks.ord,
        documentId: documents.id,
        documentTitle: documents.title,
      })
      .from(chunks)
      .innerJoin(documents, eq(chunks.documentId, documents.id))
      .where(ilike(chunks.text, pattern))
      .limit(perSource),
  ]);

  return [
    ...documentRows.map((row) => ({
      kind: 'document' as const,
      id: row.id,
      title: row.title,
      snippet: 'Tài liệu trong thư viện',
      href: `/library/${row.id}`,
    })),
    ...noteRows.map((row) => ({
      kind: 'note' as const,
      id: row.id,
      title: row.title,
      snippet: snippetAround(row.bodyMd, query),
      href: `/notes?note=${row.id}`,
    })),
    ...chunkRows.map((row) => ({
      kind: 'chunk' as const,
      id: row.id,
      title: `${row.documentTitle} — đoạn ${row.ord + 1}`,
      snippet: snippetAround(row.text, query),
      href: `/library/${row.documentId}`,
    })),
  ];
}

// Giữ chỗ cho lọc theo loại ở UI mà không phải truyền lại truy vấn.
export type GlobalSearchFilter = 'all' | GlobalHitKind;

export function filterHits(hits: GlobalHit[], filter: GlobalSearchFilter): GlobalHit[] {
  return filter === 'all' ? hits : hits.filter((hit) => hit.kind === filter);
}
