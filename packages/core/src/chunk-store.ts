import { and, asc, eq, gte, sql } from 'drizzle-orm';
import type { TextChunk } from './chunk';
import type { Db } from './db/client';
import { getDb } from './db/client';
import { chunks } from './db/schema';

// Ghi chunk của một tài liệu (Giai đoạn 2, T1).
//
// Driver `neon-http` không giữ transaction, nên lần ghi làm theo hai câu lệnh đều lặp lại được:
// upsert theo `(document_id, ord)` rồi xoá các `ord` còn dư từ lần chia trước. Chạy lại cùng một
// bản Markdown cho ra đúng bộ chunk cũ, không sinh bản trùng.

export type StoredChunk = {
  ord: number;
  text: string;
  tokenCount: number | null;
  embedModel: string | null;
};

export type ChunkStore = {
  replace(documentId: string, items: TextChunk[]): Promise<number>;
  list(documentId: string): Promise<StoredChunk[]>;
};

export function createChunkStore(db?: Db): ChunkStore {
  const handle = (): Db => (db ??= getDb());

  return {
    async replace(documentId, items) {
      const handleDb = handle();
      if (items.length > 0) {
        await handleDb
          .insert(chunks)
          .values(
            items.map((item) => ({
              documentId,
              ord: item.ord,
              text: item.text,
              tokenCount: item.tokenCount,
            })),
          )
          .onConflictDoUpdate({
            target: [chunks.documentId, chunks.ord],
            set: {
              text: sql`excluded."text"`,
              tokenCount: sql`excluded."token_count"`,
              // Nội dung đổi thì vector cũ không còn đúng; T2 sinh lại.
              embedModel: null,
            },
          });
        await handleDb
          .delete(chunks)
          .where(and(eq(chunks.documentId, documentId), gte(chunks.ord, items.length)));
      } else {
        await handleDb.delete(chunks).where(eq(chunks.documentId, documentId));
      }
      return items.length;
    },

    async list(documentId) {
      return handle()
        .select({
          ord: chunks.ord,
          text: chunks.text,
          tokenCount: chunks.tokenCount,
          embedModel: chunks.embedModel,
        })
        .from(chunks)
        .where(eq(chunks.documentId, documentId))
        .orderBy(asc(chunks.ord));
    },
  };
}
