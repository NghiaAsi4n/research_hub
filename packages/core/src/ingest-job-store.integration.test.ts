import { existsSync, readFileSync } from 'node:fs';
import { eq, or } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getDb } from './db/client';
import { jobs } from './db/schema';
import { createPdfJobStore } from './ingest-job-store';
import { createIngestStore } from './ingest-store';

const envFile = new URL('../../../.env.local', import.meta.url);
if (process.env.INGEST_DB_TEST === '1' && existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match?.[1]) process.env[match[1]] ??= match[2]?.replace(/^['"]|['"]$/g, '');
  }
}
const describeDb =
  process.env.INGEST_DB_TEST === '1' && process.env.DATABASE_URL ? describe : describe.skip;
const idemKey = `ingest:t6-verify-${crypto.randomUUID()}`;
const nextKey = `${idemKey}:page:9`;
const uploadKey = `${idemKey}:upload`;

describeDb('PDF job lease and progress on Postgres', () => {
  afterAll(async () => {
    await getDb()
      .delete(jobs)
      .where(or(eq(jobs.idemKey, idemKey), eq(jobs.idemKey, nextKey), eq(jobs.idemKey, uploadKey)));
  });

  it('reclaims an expired lease and persists the next page in a separate job', async () => {
    const db = getDb();
    const [inserted] = await db
      .insert(jobs)
      .values({
        type: 'ingest',
        state: 'queued',
        idemKey,
        payload: {
          documentId: crypto.randomUUID(),
          storageKey: 'documents/verify/t6.pdf',
          contentType: 'application/pdf',
          bytes: 6_000_000,
        },
      })
      .returning({ id: jobs.id });
    if (!inserted) throw new Error('No inserted job');
    const store = createPdfJobStore(db);
    const first = await store.claim(inserted.id);
    expect(first?.payload.storageKey).toBe('documents/verify/t6.pdf');
    expect(await store.claim(inserted.id)).toBeNull();
    await db
      .update(jobs)
      .set({ leaseExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(jobs.id, inserted.id));
    const retry = await store.claim(inserted.id);
    expect(retry?.leaseOwner).not.toBe(first?.leaseOwner);
    expect(retry?.payload.bytes).toBe(6_000_000);
    if (!first || !retry) throw new Error('Could not reclaim lease');
    expect(await store.finish(first)).toBe(false);
    expect(
      await store.finish(retry, {
        ...retry.payload,
        startPage: 9,
        parts: ['documents/verify/t6.pdf.page-1.md'],
        textLength: 123,
      }),
    ).toBe(true);
    const [next] = await db.select().from(jobs).where(eq(jobs.idemKey, nextKey));
    expect(next?.state).toBe('queued');
    expect(next?.payload).toMatchObject({ startPage: 9, textLength: 123 });
  }, 60_000);

  it('persists the multipart session in the job payload and refuses a second session', async () => {
    const [inserted] = await getDb()
      .insert(jobs)
      .values({
        type: 'ingest',
        state: 'awaiting_upload',
        idemKey: uploadKey,
        payload: { storageKey: 'documents/verify/t6-upload.pdf', subject: 'test-user' },
      })
      .returning({ id: jobs.id });
    if (!inserted) throw new Error('No upload job');
    const store = createIngestStore();
    expect(
      await store.saveMultipartUpload({
        jobId: inserted.id,
        uploadId: 'session-1',
        bytes: 6_000_000,
        partCount: 2,
      }),
    ).toBe(true);
    expect(
      await store.saveMultipartUpload({
        jobId: inserted.id,
        uploadId: 'session-2',
        bytes: 6_000_000,
        partCount: 2,
      }),
    ).toBe(false);
    expect(await store.getUploadJob(inserted.id)).toMatchObject({
      storageKey: 'documents/verify/t6-upload.pdf',
      uploadId: 'session-1',
      bytes: 6_000_000,
      partCount: 2,
      subject: 'test-user',
    });
  }, 60_000);
});
