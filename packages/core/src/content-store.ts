import { and, desc, eq, lte, or, sql } from 'drizzle-orm';
import { hashContentChunks } from './content-hash';
import { type Db, getDb } from './db/client';
import { documentSources, documents, jobs, sources } from './db/schema';
import { createDocumentStore, type DocumentStore } from './document-store';
import { getObjectChunks, markdownKeyFor } from './storage';

export type ContentDocument = { id: string; storageKey: string; status: string };
export type DocumentSource = { id: string; kind: string; url: string | null };

export function createContentStore(db?: Db) {
  const handle = () => (db ??= getDb());
  return {
    async findBySource(sourceId: string): Promise<ContentDocument | null> {
      const [row] = await handle()
        .select({ id: documents.id, storageKey: documents.storageKey, status: documents.status })
        .from(documentSources)
        .innerJoin(documents, eq(documentSources.documentId, documents.id))
        .where(eq(documentSources.sourceId, sourceId))
        .orderBy(
          sql`case when ${documents.status} = 'ready' then 0 else 1 end`,
          desc(documents.createdAt),
        )
        .limit(1);
      return row ?? null;
    },
    async register(input: {
      sourceId: string;
      title: string;
      storageKey: string;
      hash: string;
    }): Promise<ContentDocument> {
      // Upsert is atomic even when different URLs finish extraction concurrently.
      const [document] = await handle()
        .insert(documents)
        .values(input)
        .onConflictDoUpdate({ target: documents.hash, set: { hash: sql`${documents.hash}` } })
        .returning({
          id: documents.id,
          storageKey: documents.storageKey,
          status: documents.status,
        });
      if (!document) throw new Error('Content registration returned no document');
      await handle()
        .insert(documentSources)
        .values({ documentId: document.id, sourceId: input.sourceId })
        .onConflictDoNothing();
      return document;
    },
    async sources(documentId: string): Promise<DocumentSource[]> {
      return handle()
        .select({ id: sources.id, kind: sources.kind, url: sources.url })
        .from(documentSources)
        .innerJoin(sources, eq(sources.id, documentSources.sourceId))
        .where(eq(documentSources.documentId, documentId));
    },
    async claimHtmlJob(jobId: string): Promise<string | null> {
      const leaseOwner = crypto.randomUUID();
      const now = new Date();
      const [claimed] = await handle()
        .update(jobs)
        .set({
          state: 'running',
          leaseOwner,
          leaseExpiresAt: new Date(now.getTime() + 10 * 60_000),
          attempt: sql`${jobs.attempt} + 1`,
        })
        .where(
          and(
            eq(jobs.id, jobId),
            eq(jobs.type, 'ingest'),
            or(
              eq(jobs.state, 'queued'),
              eq(jobs.state, 'failed'),
              and(eq(jobs.state, 'running'), lte(jobs.leaseExpiresAt, now)),
            ),
          ),
        )
        .returning({ id: jobs.id });
      return claimed ? leaseOwner : null;
    },
    async releaseHtmlJob(jobId: string, leaseOwner: string): Promise<void> {
      await handle()
        .update(jobs)
        .set({ state: 'failed', leaseOwner: null, leaseExpiresAt: null })
        .where(and(eq(jobs.id, jobId), eq(jobs.leaseOwner, leaseOwner), eq(jobs.state, 'running')));
    },
    async completeHtmlJob(jobId: string, leaseOwner: string): Promise<void> {
      const [completed] = await handle()
        .update(jobs)
        .set({ state: 'done', leaseOwner: null, leaseExpiresAt: null })
        .where(and(eq(jobs.id, jobId), eq(jobs.leaseOwner, leaseOwner), eq(jobs.state, 'running')))
        .returning({ id: jobs.id });
      if (!completed) throw new Error('HTML ingest job lease was lost');
    },
  };
}

// Wrap only application entry points; the extractor contract and T7's stream work stay independent.
export function createDeduplicatingDocumentStore(db?: Db): DocumentStore {
  const base = createDocumentStore(db);
  return {
    ...base,
    async markReady(input) {
      const handle = db ?? getDb();
      const [document] = await handle
        .select({ storageKey: documents.storageKey })
        .from(documents)
        .where(eq(documents.id, input.id));
      if (!document) {
        const result = await handle.execute(
          sql`select document_id from document_aliases where id = ${input.id}::uuid`,
        );
        if (result.rows.length) return;
        throw new Error('Document not found during content finalization');
      }
      const hash = await hashContentChunks(getObjectChunks(markdownKeyFor(document.storageKey)));
      await handle.execute(
        sql`select rh_finish_document(${input.id}::uuid, ${hash}, ${JSON.stringify(input)}::jsonb)`,
      );
    },
  };
}
