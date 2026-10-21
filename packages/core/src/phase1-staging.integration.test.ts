import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContentStore } from './content-store';
import { getDb } from './db/client';
import { documents, jobs, sources } from './db/schema';
import { sha256Hex } from './ingest';
import { createIngestStore } from './ingest-store';
import { createReaderStore } from './reader-store';
import { deleteObject, getObjectBytes, putObject } from './storage';

// Opt-in checks against an isolated Neon branch. The branch guard refuses to write unless the
// expected branch ID is explicitly supplied, so this suite cannot accidentally target production.
const enabled = process.env.PHASE1_LIVE_TEST === '1' && Boolean(process.env.DATABASE_URL);
const live = enabled ? describe : describe.skip;
const expectedBranchId = process.env.PHASE1_LIVE_EXPECTED_BRANCH;
const marker = randomUUID();
const dedupeHash = sha256Hex(`phase1-live-dedupe-${marker}`);
const readerHash = sha256Hex(`phase1-live-reader-${marker}`);
const dedupeSourceIds = [randomUUID(), randomUUID()];
const readerSourceId = randomUUID();
const idemKey = `ingest:content:${dedupeHash}`;
const objectKey = `documents/verify/phase1-live-${marker}.txt`;
let branchVerified = false;

live('Phase 1 persistence on isolated Neon staging', () => {
  beforeAll(async () => {
    if (!expectedBranchId) throw new Error('PHASE1_LIVE_EXPECTED_BRANCH is required');
    const result = await getDb().execute(
      sql`select current_setting('neon.branch_id', true) as branch_id`,
    );
    const row = result.rows[0] as { branch_id?: string } | undefined;
    if (row?.branch_id !== expectedBranchId) {
      throw new Error(
        'Refusing live test: connected Neon branch does not match expected branch ID',
      );
    }
    branchVerified = true;
  }, 30_000);

  afterAll(async () => {
    if (!branchVerified) return;
    await deleteObject(objectKey).catch(() => undefined);
    const db = getDb();
    await db.delete(jobs).where(eq(jobs.idemKey, idemKey));
    await db.delete(documents).where(inArray(documents.hash, [dedupeHash, readerHash]));
    await db.delete(sources).where(inArray(sources.id, [...dedupeSourceIds, readerSourceId]));
  });

  it('deduplicates equal content from two distinct URLs in Postgres', async () => {
    const db = getDb();
    const content = createContentStore(db);
    const ingest = createIngestStore(db);
    const documentsCreated: string[] = [];
    const jobsCreated: string[] = [];

    for (const [index, sourceId] of dedupeSourceIds.entries()) {
      await ingest.upsertSource({
        id: sourceId,
        kind: 'url',
        url: `https://phase1-staging.example.test/${marker}/${index}`,
        domain: 'phase1-staging.example.test',
      });
      const document = await content.register({
        sourceId,
        title: 'Phase 1 staging duplicate fixture',
        storageKey: `documents/verify/phase1-live-${marker}-${index}.md`,
        hash: dedupeHash,
      });
      documentsCreated.push(document.id);
      const job = await ingest.upsertJob({
        type: 'ingest',
        idemKey,
        state: 'queued',
        payload: { documentId: document.id, sourceId },
      });
      jobsCreated.push(job.id);
    }

    const storedDocuments = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.hash, dedupeHash));
    const storedJobs = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.idemKey, idemKey));
    expect(new Set(documentsCreated).size).toBe(1);
    expect(new Set(jobsCreated).size).toBe(1);
    expect(storedDocuments).toHaveLength(1);
    expect(storedJobs).toHaveLength(1);
    expect(await content.sources(documentsCreated[0] as string)).toHaveLength(2);
    expect((await content.findBySource(dedupeSourceIds[1] as string))?.id).toBe(
      documentsCreated[0],
    );
  }, 30_000);

  it('persists reader position and highlights across store instances and isolates user IDs', async () => {
    const db = getDb();
    const ingest = createIngestStore(db);
    const content = createContentStore(db);
    await ingest.upsertSource({
      id: readerSourceId,
      kind: 'url',
      url: `https://phase1-staging.example.test/${marker}/reader`,
      domain: 'phase1-staging.example.test',
    });
    const document = await content.register({
      sourceId: readerSourceId,
      title: 'Phase 1 staging reader fixture',
      storageKey: `documents/verify/phase1-live-${marker}-reader.md`,
      hash: readerHash,
    });

    const userId = `phase1-live-${marker}`;
    const firstStore = createReaderStore(db);
    await firstStore.saveProgress(document.id, userId, { section: 'test-section', ratio: 0.42 });
    const highlight = await firstStore.addHighlight(document.id, userId, {
      startOffset: 0,
      endOffset: 5,
      quote: 'hello',
    });
    const reloaded = await createReaderStore(db).get(document.id, userId);
    expect(reloaded?.progress).toEqual({ section: 'test-section', ratio: 0.42 });
    expect(reloaded?.highlights).toEqual([highlight]);

    const otherUser = await createReaderStore(db).get(document.id, `${userId}-other`);
    expect(otherUser?.progress).toBeNull();
    expect(otherUser?.highlights).toEqual([]);
    await createReaderStore(db).removeHighlight(document.id, `${userId}-other`, highlight.id);
    expect((await createReaderStore(db).get(document.id, userId))?.highlights).toEqual([highlight]);
  }, 30_000);

  it('writes, reads and deletes an isolated Object Storage object', async () => {
    const body = new TextEncoder().encode(`Phase 1 storage fixture ${marker}`);
    await putObject(objectKey, body, 'text/plain; charset=utf-8');
    expect(new TextDecoder().decode(await getObjectBytes(objectKey))).toBe(
      new TextDecoder().decode(body),
    );
  }, 30_000);
});
