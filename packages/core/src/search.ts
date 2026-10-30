import { sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { getDb } from './db/client';
import { type Embedder, EmbedError } from './embed';

// Tìm kiếm lai giữa full-text và vector (Giai đoạn 2, T3).
//
// Nhánh full-text dùng config `simple` trên `rh_unaccent(text)` để câu hỏi có dấu và không dấu
// cho cùng kết quả trên văn bản tiếng Việt. Nhánh vector xếp theo cosine trên `chunks.embedding`
// (chỉ mục HNSW ở migration 0005). Hai bảng xếp hạng được hợp nhất bằng RRF.

export type RankedItem = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  ord: number;
  text: string;
  score: number;
};

export type SearchHit = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  ord: number;
  text: string;
  ftsRank: number | null;
  vectorRank: number | null;
  vectorScore: number | null;
  rrf: number;
};

export const RRF_K = 60;

type Row = {
  id: string;
  document_id: string;
  title: string;
  ord: number;
  text: string;
  score: number | string;
};

function toRanked(rows: Row[]): RankedItem[] {
  return rows.map((row) => ({
    chunkId: row.id,
    documentId: row.document_id,
    documentTitle: row.title,
    ord: row.ord,
    text: row.text,
    score: Number(row.score),
  }));
}

export function mergeRrf(input: {
  fts: RankedItem[];
  vector: RankedItem[];
  limit?: number;
  k?: number;
}): SearchHit[] {
  const k = input.k ?? RRF_K;
  const merged = new Map<string, SearchHit>();

  const add = (items: RankedItem[], branch: 'fts' | 'vector') => {
    items.forEach((item, index) => {
      const rank = index + 1;
      const entry: SearchHit = merged.get(item.chunkId) ?? {
        chunkId: item.chunkId,
        documentId: item.documentId,
        documentTitle: item.documentTitle,
        ord: item.ord,
        text: item.text,
        ftsRank: null,
        vectorRank: null,
        vectorScore: null,
        rrf: 0,
      };
      entry.rrf += 1 / (k + rank);
      if (branch === 'fts') {
        entry.ftsRank = rank;
      } else {
        entry.vectorRank = rank;
        entry.vectorScore = item.score;
      }
      merged.set(item.chunkId, entry);
    });
  };

  add(input.fts, 'fts');
  add(input.vector, 'vector');

  return [...merged.values()]
    .sort((left, right) => right.rrf - left.rrf || left.ord - right.ord)
    .slice(0, input.limit ?? 10);
}

export async function searchFullText(input: {
  query: string;
  candidates?: number;
  db?: Db;
}): Promise<RankedItem[]> {
  const db = input.db ?? getDb();
  const candidates = Math.max(1, input.candidates ?? 40);
  // Câu hỏi tự nhiên hiếm khi chứa đủ mọi từ của một đoạn, nên truy vấn nối các từ bằng OR rồi
  // để `ts_rank` xếp hạng; nếu dùng AND mặc định của `plainto_tsquery` thì gần như không khớp.
  const orQuery = toOrQuery(input.query);
  if (!orQuery) return [];
  const result = await db.execute(sql`
    select c.id, c.document_id, d.title, c.ord, c.text,
      ts_rank(
        to_tsvector('simple', rh_unaccent(c.text)),
        to_tsquery('simple', rh_unaccent(${orQuery}))
      ) as score
    from chunks c
    join documents d on d.id = c.document_id
    where to_tsvector('simple', rh_unaccent(c.text))
      @@ to_tsquery('simple', rh_unaccent(${orQuery}))
    order by score desc, c.ord asc
    limit ${candidates}
  `);
  return toRanked(result.rows as unknown as Row[]);
}

// Chuyển câu hỏi thành truy vấn OR an toàn cho `to_tsquery`: chỉ giữ chữ và số.
export function toOrQuery(query: string): string {
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 0);
  return terms.join(' | ');
}

export async function searchVector(input: {
  vector: number[];
  candidates?: number;
  db?: Db;
}): Promise<RankedItem[]> {
  if (input.vector.length === 0) throw new EmbedError('embed_empty_query');
  const db = input.db ?? getDb();
  const candidates = Math.max(1, input.candidates ?? 40);
  const literal = `[${input.vector.join(',')}]`;
  const result = await db.execute(sql`
    select c.id, c.document_id, d.title, c.ord, c.text,
      1 - (c.embedding <=> ${literal}::vector) as score
    from chunks c
    join documents d on d.id = c.document_id
    where c.embedding is not null
    order by c.embedding <=> ${literal}::vector
    limit ${candidates}
  `);
  return toRanked(result.rows as unknown as Row[]);
}

export async function hybridSearch(input: {
  query: string;
  embed: Embedder;
  db?: Db;
  limit?: number;
  candidates?: number;
  k?: number;
}): Promise<SearchHit[]> {
  const [queryVector] = await input.embed([input.query]);
  if (!queryVector) throw new EmbedError('embed_empty_query');

  const candidates = input.candidates ?? 40;
  const [fts, vector] = await Promise.all([
    searchFullText({ query: input.query, candidates, db: input.db }),
    searchVector({ vector: queryVector, candidates, db: input.db }),
  ]);

  return mergeRrf({ fts, vector, limit: input.limit, k: input.k });
}
