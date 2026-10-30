import { eq, sql } from 'drizzle-orm';
import { type ChunkOptions, chunkMarkdown } from './chunk';
import { createChunkStore } from './chunk-store';
import type { Db } from './db/client';
import { getDb } from './db/client';
import { documents } from './db/schema';
import { DEFAULT_EMBED_MODEL, type Embedder } from './embed';
import { type EmbedReport, embedDocumentChunks } from './embed-store';
import { getObjectChunks, markdownKeyFor } from './storage';

// Chia chunk và sinh vector cho một tài liệu đã `ready` (Giai đoạn 2, T1 + T2).
//
// Đây là đường nối sau ingest: đọc bản Markdown sạch trong Object Storage, chia chunk, ghi
// `chunks`, rồi sinh vector. Chạy lại an toàn nhờ upsert theo `(document_id, ord)` và cache theo
// nội dung chunk.

export type IndexReport = {
  documentId: string;
  chunks: number;
  embedded: number;
  reused: number;
  batches: number;
  model: string;
};

// Tài liệu đã `ready` nhưng chưa có chunk nào: dùng cho lần chạy đầu sau khi nâng cấp.
export async function listUnindexedDocumentIds(input?: {
  db?: Db;
  limit?: number;
}): Promise<string[]> {
  const db = input?.db ?? getDb();
  const limit = Math.max(1, input?.limit ?? 5);
  const result = await db.execute(sql`
    select d.id
    from documents d
    where d.status = 'ready'
      and not exists (select 1 from chunks c where c.document_id = d.id)
    order by d.created_at asc
    limit ${limit}
  `);
  return (result.rows as unknown as { id: string }[]).map((row) => row.id);
}

async function collect(chunks: AsyncIterable<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  for await (const part of chunks) text += decoder.decode(part, { stream: true });
  return text;
}

export async function indexDocument(input: {
  documentId: string;
  embed: Embedder;
  db?: Db;
  model?: string;
  chunkOptions?: ChunkOptions;
  batchSize?: number;
  dim?: number;
  readMarkdown?: (storageKey: string) => Promise<string>;
}): Promise<IndexReport> {
  const db = input.db ?? getDb();
  const model = input.model ?? DEFAULT_EMBED_MODEL;

  const [document] = await db
    .select({ id: documents.id, storageKey: documents.storageKey, status: documents.status })
    .from(documents)
    .where(eq(documents.id, input.documentId))
    .limit(1);
  if (!document) throw new Error('index_document_not_found');

  const readMarkdown =
    input.readMarkdown ??
    ((storageKey: string) => collect(getObjectChunks(markdownKeyFor(storageKey))));
  const markdown = await readMarkdown(document.storageKey);

  const items = chunkMarkdown(markdown, input.chunkOptions);
  const store = createChunkStore(db);
  await store.replace(document.id, items);

  const embedded: EmbedReport = await embedDocumentChunks({
    documentId: document.id,
    embed: input.embed,
    model,
    db,
    batchSize: input.batchSize,
    dim: input.dim,
  });

  return {
    documentId: document.id,
    chunks: items.length,
    embedded: embedded.embedded,
    reused: embedded.reused,
    batches: embedded.batches,
    model,
  };
}
