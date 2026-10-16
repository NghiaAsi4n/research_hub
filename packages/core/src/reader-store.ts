import { and, asc, desc, eq } from 'drizzle-orm';
import { createContentStore } from './content-store';
import { type Db, getDb } from './db/client';
import { documentAliases, documents, highlights, readingProgress } from './db/schema';
import type { HighlightInput, ReaderDocument, ReadingPosition } from './reader';

export function createReaderStore(db?: Db) {
  const handle = () => (db ??= getDb());
  const resolve = async (id: string) => {
    const [alias] = await handle()
      .select({ id: documentAliases.documentId })
      .from(documentAliases)
      .where(eq(documentAliases.id, id));
    return alias?.id ?? id;
  };
  return {
    async list(offset = 0) {
      return handle()
        .select({
          id: documents.id,
          title: documents.title,
          status: documents.status,
          pages: documents.pages,
        })
        .from(documents)
        .orderBy(desc(documents.createdAt), asc(documents.id))
        .limit(30)
        .offset(offset);
    },
    async get(
      id: string,
      userId: string,
    ): Promise<(ReaderDocument & { storageKey: string }) | null> {
      const canonicalId = await resolve(id);
      const [document] = await handle()
        .select({
          id: documents.id,
          title: documents.title,
          status: documents.status,
          pages: documents.pages,
          storageKey: documents.storageKey,
        })
        .from(documents)
        .where(eq(documents.id, canonicalId));
      if (!document) return null;
      const [progress, savedHighlights, sources] = await Promise.all([
        handle()
          .select({ section: readingProgress.section, ratio: readingProgress.ratio })
          .from(readingProgress)
          .where(
            and(eq(readingProgress.documentId, canonicalId), eq(readingProgress.userId, userId)),
          ),
        handle()
          .select({
            id: highlights.id,
            startOffset: highlights.startOffset,
            endOffset: highlights.endOffset,
            quote: highlights.quote,
          })
          .from(highlights)
          .where(and(eq(highlights.documentId, canonicalId), eq(highlights.userId, userId)))
          .orderBy(asc(highlights.startOffset)),
        createContentStore(handle()).sources(canonicalId),
      ]);
      return { ...document, progress: progress[0] ?? null, highlights: savedHighlights, sources };
    },
    async saveProgress(documentId: string, userId: string, input: ReadingPosition) {
      await handle()
        .insert(readingProgress)
        .values({ documentId, userId, ...input })
        .onConflictDoUpdate({
          target: [readingProgress.userId, readingProgress.documentId],
          set: { ...input, updatedAt: new Date() },
        });
    },
    async addHighlight(documentId: string, userId: string, input: HighlightInput) {
      const [highlight] = await handle()
        .insert(highlights)
        .values({ documentId, userId, ...input })
        .onConflictDoUpdate({
          target: [
            highlights.userId,
            highlights.documentId,
            highlights.startOffset,
            highlights.endOffset,
          ],
          set: { quote: input.quote },
        })
        .returning({
          id: highlights.id,
          startOffset: highlights.startOffset,
          endOffset: highlights.endOffset,
          quote: highlights.quote,
        });
      if (!highlight) throw new Error('Highlight save returned no row');
      return highlight;
    },
    async removeHighlight(documentId: string, userId: string, id: string) {
      await handle()
        .delete(highlights)
        .where(
          and(
            eq(highlights.id, id),
            eq(highlights.documentId, documentId),
            eq(highlights.userId, userId),
          ),
        );
    },
  };
}

export type ReaderStore = ReturnType<typeof createReaderStore>;
