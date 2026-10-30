import { and, eq, lte, or, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { getDb } from './db/client';
import { jobs } from './db/schema';
import { DEFAULT_EMBED_MODEL, type Embedder, EmbedError } from './embed';
import { embedChunkTexts } from './embed-store';

// Reindex khi đổi model embedding (Giai đoạn 2, T6).
//
// Chunk còn mang `embed_model` khác model hiện tại được sinh lại theo lô qua bảng `jobs` + lease
// của Giai đoạn 1: mỗi lượt chỉ xử lý một lô trong ngân sách 240 giây, xong thì trả job về
// `queued` cho lượt sau giành tiếp. `EMBED_DIM` chỉ nên đổi sau khi job báo `remaining = 0`.

export const REINDEX_LEASE_MS = 240_000;
export const DEFAULT_REINDEX_BATCH = 64;

export type ReindexBatchReport = {
  jobId: string;
  model: string;
  processed: number;
  remaining: number;
  done: boolean;
};

export async function enqueueReindexJob(input?: { model?: string; db?: Db }): Promise<string> {
  const db = input?.db ?? getDb();
  const model = input?.model ?? DEFAULT_EMBED_MODEL;
  const [row] = await db
    .insert(jobs)
    .values({
      type: 'reindex',
      state: 'queued',
      idemKey: `reindex:${model}`,
      payload: { model },
    })
    .onConflictDoUpdate({
      target: jobs.idemKey,
      set: { state: 'queued', leaseOwner: null, leaseExpiresAt: null },
    })
    .returning({ id: jobs.id });
  if (!row) throw new Error('Reindex job was not created');
  return row.id;
}

export async function claimReindexJob(input: {
  jobId: string;
  leaseMs?: number;
  db?: Db;
}): Promise<string | null> {
  const db = input.db ?? getDb();
  const leaseOwner = crypto.randomUUID();
  const now = new Date();
  const [claimed] = await db
    .update(jobs)
    .set({
      state: 'running',
      leaseOwner,
      leaseExpiresAt: new Date(now.getTime() + (input.leaseMs ?? REINDEX_LEASE_MS)),
      attempt: sql`${jobs.attempt} + 1`,
    })
    .where(
      and(
        eq(jobs.id, input.jobId),
        eq(jobs.type, 'reindex'),
        or(
          eq(jobs.state, 'queued'),
          eq(jobs.state, 'failed'),
          and(eq(jobs.state, 'running'), lte(jobs.leaseExpiresAt, now)),
        ),
      ),
    )
    .returning({ id: jobs.id });
  return claimed ? leaseOwner : null;
}

async function countPending(db: Db, model: string): Promise<number> {
  const result = await db.execute(sql`
    select count(*)::int as count
    from chunks
    where embedding is null or embed_model is distinct from ${model}
  `);
  const row = (result.rows as unknown as { count: number }[])[0];
  return Number(row?.count ?? 0);
}

// Xử lý một lô: nhận job đã giành lease, sinh vector cho các chunk còn lệch model, rồi quyết định
// đóng job hay trả về hàng đợi cho lượt kế tiếp.
export async function runReindexBatch(input: {
  jobId: string;
  leaseOwner: string;
  embed: Embedder;
  model?: string;
  db?: Db;
  batchSize?: number;
  dim?: number;
}): Promise<ReindexBatchReport> {
  const db = input.db ?? getDb();
  const model = input.model ?? DEFAULT_EMBED_MODEL;
  const batchSize = Math.max(1, input.batchSize ?? DEFAULT_REINDEX_BATCH);

  const pending = await db.execute(sql`
    select id, text
    from chunks
    where embedding is null or embed_model is distinct from ${model}
    order by ord asc
    limit ${batchSize}
  `);
  const rows = pending.rows as unknown as { id: string; text: string }[];

  if (rows.length === 0) {
    await finishJob(db, input.jobId, input.leaseOwner, 'done');
    return { jobId: input.jobId, model, processed: 0, remaining: 0, done: true };
  }

  try {
    await embedChunkTexts({
      rows,
      embed: input.embed,
      model,
      db,
      dim: input.dim,
    });
  } catch (error) {
    if (error instanceof EmbedError) {
      await finishJob(db, input.jobId, input.leaseOwner, 'failed');
    }
    throw error;
  }

  const remaining = await countPending(db, model);
  await finishJob(db, input.jobId, input.leaseOwner, remaining === 0 ? 'done' : 'queued');
  return { jobId: input.jobId, model, processed: rows.length, remaining, done: remaining === 0 };
}

async function finishJob(
  db: Db,
  jobId: string,
  leaseOwner: string,
  state: 'queued' | 'done' | 'failed',
): Promise<void> {
  const [updated] = await db
    .update(jobs)
    .set({ state, leaseOwner: null, leaseExpiresAt: null })
    .where(and(eq(jobs.id, jobId), eq(jobs.leaseOwner, leaseOwner), eq(jobs.state, 'running')))
    .returning({ id: jobs.id });
  if (!updated) throw new Error('Reindex job lease was lost');
}
