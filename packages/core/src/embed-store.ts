import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { getDb } from './db/client';
import { chunks } from './db/schema';
import {
  assertEmbeddingDim,
  DEFAULT_EMBED_BATCH,
  DEFAULT_EMBED_MODEL,
  type Embedder,
  EmbedError,
  embedInBatches,
} from './embed';
import { resolveEmbedDim } from './env';

// Sinh và ghi vector cho chunk (Giai đoạn 2, T2).
//
// Cache theo nội dung chunk: chunk trùng chữ ở bất kỳ tài liệu nào đã có vector cùng model thì
// dùng lại, không gọi nhà cung cấp lần nữa. Hàm `embedChunkTexts` nhận danh sách dòng nên T6
// (reindex) dùng lại được mà không phải đi qua từng tài liệu.

export type EmbedReport = {
  documentId: string;
  model: string;
  scanned: number;
  reused: number;
  embedded: number;
  batches: number;
};

export type ChunkTextRow = { id: string; text: string };

export type EmbedRowsReport = { embedded: number; reused: number; batches: number };

async function loadCache(db: Db, model: string, texts: string[]): Promise<Map<string, number[]>> {
  if (texts.length === 0) return new Map();
  const rows = await db
    .select({ text: chunks.text, embedding: chunks.embedding })
    .from(chunks)
    .where(and(eq(chunks.embedModel, model), inArray(chunks.text, texts)));
  const cache = new Map<string, number[]>();
  for (const row of rows) {
    if (row.embedding) cache.set(row.text, row.embedding);
  }
  return cache;
}

async function writeVectors(
  db: Db,
  input: { model: string; items: { id: string; vector: number[] }[] },
): Promise<void> {
  if (input.items.length === 0) return;
  const payload = JSON.stringify(
    input.items.map((item) => ({ id: item.id, vec: `[${item.vector.join(',')}]` })),
  );
  await db.execute(sql`
    update chunks as c
    set embedding = (entry->>'vec')::vector, embed_model = ${input.model}
    from jsonb_array_elements(${payload}::jsonb) as entry
    where c.id = (entry->>'id')::uuid
  `);
}

export async function embedChunkTexts(input: {
  rows: ChunkTextRow[];
  embed: Embedder;
  model?: string;
  db?: Db;
  batchSize?: number;
  dim?: number;
}): Promise<EmbedRowsReport> {
  const db = input.db ?? getDb();
  const model = input.model ?? DEFAULT_EMBED_MODEL;
  const dim = input.dim ?? resolveEmbedDim(process.env.EMBED_DIM);
  const batchSize = input.batchSize ?? DEFAULT_EMBED_BATCH;

  const uniqueTexts = [...new Set(input.rows.map((row) => row.text))];
  const cache = await loadCache(db, model, uniqueTexts);

  const missing: string[] = [];
  for (const text of uniqueTexts) {
    if (!cache.has(text)) missing.push(text);
  }

  let batches = 0;
  if (missing.length > 0) {
    const vectors = await embedInBatches({
      texts: missing,
      embed: input.embed,
      batchSize,
      onBatch: () => {
        batches += 1;
      },
    });
    missing.forEach((text, index) => {
      const vector = vectors[index];
      if (!vector) throw new EmbedError('embed_missing_vector');
      assertEmbeddingDim(vector, dim);
      cache.set(text, vector);
    });
  }

  const writes = input.rows
    .map((row) => ({ id: row.id, vector: cache.get(row.text) }))
    .filter((entry): entry is { id: string; vector: number[] } => Array.isArray(entry.vector));
  await writeVectors(db, { model, items: writes });

  return {
    embedded: missing.length,
    reused: input.rows.length - missing.length,
    batches,
  };
}

type StoredRow = { id: string; ord: number; text: string; embedModel: string | null };

export async function embedDocumentChunks(input: {
  documentId: string;
  embed: Embedder;
  model?: string;
  db?: Db;
  batchSize?: number;
  dim?: number;
}): Promise<EmbedReport> {
  const db = input.db ?? getDb();
  const model = input.model ?? DEFAULT_EMBED_MODEL;

  const rows: StoredRow[] = await db
    .select({
      id: chunks.id,
      ord: chunks.ord,
      text: chunks.text,
      embedModel: chunks.embedModel,
    })
    .from(chunks)
    .where(eq(chunks.documentId, input.documentId))
    .orderBy(asc(chunks.ord));

  const pending = rows.filter((row) => row.embedModel !== model);
  const report = await embedChunkTexts({
    rows: pending.map((row) => ({ id: row.id, text: row.text })),
    embed: input.embed,
    model,
    db,
    batchSize: input.batchSize,
    dim: input.dim,
  });

  return {
    documentId: input.documentId,
    model,
    scanned: rows.length,
    reused: rows.length - report.embedded,
    embedded: report.embedded,
    batches: report.batches,
  };
}
