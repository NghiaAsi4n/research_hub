import { and, asc, eq, lte, or, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { getDb } from './db/client';
import { jobs } from './db/schema';

export type PdfJobPayload = {
  documentId: string;
  storageKey: string;
  contentType: 'application/pdf';
  bytes?: number;
  startPage?: number;
  parts?: string[];
  textLength?: number;
  title?: string;
};

export type ClaimedPdfJob = {
  id: string;
  idemKey: string;
  leaseOwner: string;
  payload: PdfJobPayload;
};

export type PdfJobStore = {
  claim(jobId?: string): Promise<ClaimedPdfJob | null>;
  finish(job: ClaimedPdfJob, next?: PdfJobPayload): Promise<boolean>;
};

const LEASE_MS = 240_000;

export function createPdfJobStore(db?: Db): PdfJobStore {
  let resolved = db;
  const handle = () => (resolved ??= getDb());
  return {
    async claim(jobId) {
      const now = new Date();
      const candidates = await handle()
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.type, 'ingest'),
            sql`${jobs.payload}->>'contentType' = 'application/pdf'`,
            or(
              and(eq(jobs.state, 'queued'), lte(jobs.runAt, now)),
              and(eq(jobs.state, 'running'), lte(jobs.leaseExpiresAt, now)),
            ),
            jobId ? eq(jobs.id, jobId) : undefined,
          ),
        )
        .orderBy(asc(jobs.runAt))
        .limit(5);
      for (const candidate of candidates) {
        const leaseOwner = crypto.randomUUID();
        const [claimed] = await handle()
          .update(jobs)
          .set({
            state: 'running',
            leaseOwner,
            leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
            attempt: sql`${jobs.attempt} + 1`,
          })
          .where(
            and(
              eq(jobs.id, candidate.id),
              or(
                eq(jobs.state, 'queued'),
                and(eq(jobs.state, 'running'), lte(jobs.leaseExpiresAt, now)),
              ),
            ),
          )
          .returning({ id: jobs.id, idemKey: jobs.idemKey, payload: jobs.payload });
        if (claimed?.payload && typeof claimed.payload === 'object') {
          return {
            id: claimed.id,
            idemKey: claimed.idemKey,
            leaseOwner,
            payload: claimed.payload as PdfJobPayload,
          };
        }
      }
      return null;
    },
    async finish(job, next) {
      if (!next) {
        const [finished] = await handle()
          .update(jobs)
          .set({ state: 'done', leaseOwner: null, leaseExpiresAt: null })
          .where(
            and(
              eq(jobs.id, job.id),
              eq(jobs.state, 'running'),
              eq(jobs.leaseOwner, job.leaseOwner),
            ),
          )
          .returning({ id: jobs.id });
        return finished !== undefined;
      }
      // The neon-http driver cannot open a transaction. One CTE keeps finishing
      // the leased job and inserting its successor atomic in Postgres.
      const nextKey = `${job.idemKey.split(':page:')[0]}:page:${next.startPage}`;
      const result = await handle().execute(sql`
        WITH finished AS (
          UPDATE ${jobs} SET state = 'done', lease_owner = NULL, lease_expires_at = NULL
          WHERE id = ${job.id} AND state = 'running' AND lease_owner = ${job.leaseOwner}
          RETURNING id
        ), successor AS (
          INSERT INTO ${jobs} (type, state, idem_key, payload)
          SELECT 'ingest', 'queued', ${nextKey}, ${JSON.stringify(next)}::jsonb FROM finished
          ON CONFLICT (idem_key) DO NOTHING RETURNING id
        )
        SELECT EXISTS(SELECT 1 FROM finished) AS finished
      `);
      return result.rows[0]?.finished === true;
    },
  };
}
