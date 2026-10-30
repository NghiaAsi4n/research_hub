import { eq } from 'drizzle-orm';
import { type ChunkOptions, chunkMarkdown } from './chunk';
import { createChunkStore } from './chunk-store';
import { contentHash } from './content-hash';
import type { Db } from './db/client';
import { getDb } from './db/client';
import { documents } from './db/schema';
import { GOLD_DOCUMENTS, type GoldDocument } from './gold-corpus';

// Nạp sáu tài liệu mẫu của bộ câu hỏi vàng vào kho (Giai đoạn 2, T5).
//
// Chỉ ghi tài liệu và chunk; vector do `/api/maintenance/index` sinh sau, nên bước nạp chạy được
// cả khi chưa có khoá model. Chạy lại an toàn: cùng nội dung cho cùng hash nên chỉ một bản ghi.

export type GoldSeedReport = {
  title: string;
  documentId: string;
  chunks: number;
  created: boolean;
};

export async function seedGoldCorpus(input?: {
  db?: Db;
  documents?: GoldDocument[];
  chunkOptions?: ChunkOptions;
}): Promise<GoldSeedReport[]> {
  const db = input?.db ?? getDb();
  const corpus = input?.documents ?? GOLD_DOCUMENTS;
  const store = createChunkStore(db);
  const reports: GoldSeedReport[] = [];

  for (const document of corpus) {
    const hash = contentHash(document.markdown);
    const [existing] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.hash, hash))
      .limit(1);

    let documentId = existing?.id;
    if (!documentId) {
      const [created] = await db
        .insert(documents)
        .values({
          title: document.title,
          storageKey: `documents/gold-${hash.slice(0, 12)}.md`,
          hash,
          status: 'ready',
          bytes: document.markdown.length,
        })
        .onConflictDoUpdate({ target: documents.hash, set: { title: document.title } })
        .returning({ id: documents.id });
      if (!created) throw new Error('gold seed insert failed');
      documentId = created.id;
    }

    const items = chunkMarkdown(document.markdown, input?.chunkOptions);
    await store.replace(documentId, items);
    reports.push({
      title: document.title,
      documentId,
      chunks: items.length,
      created: existing === undefined,
    });
  }

  return reports;
}
