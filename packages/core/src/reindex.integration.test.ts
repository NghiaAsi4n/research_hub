import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { EmbedError } from './embed';
import { claimReindexJob, enqueueReindexJob, runReindexBatch } from './reindex';

const pg = new PGlite();

beforeAll(async () => {
  await pg.exec(`
    create domain vector as text;
    create table documents (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      storage_key text not null,
      hash text not null,
      status text default 'ready' not null
    );
    create table chunks (
      id uuid primary key default gen_random_uuid(),
      document_id uuid not null references documents(id) on delete cascade,
      ord integer not null,
      text text not null,
      token_count integer,
      embed_model text,
      embedding vector
    );
    create table jobs (
      id uuid primary key default gen_random_uuid(),
      type text not null,
      payload jsonb,
      idem_key text not null,
      state text default 'queued' not null,
      run_at timestamptz default now() not null,
      attempt integer default 0 not null,
      lease_owner text,
      lease_expires_at timestamptz,
      created_at timestamptz default now() not null
    );
    create unique index jobs_idem_key_idx on jobs (idem_key);
  `);
}, 20_000);

afterAll(() => pg.close());

beforeEach(async () => {
  await pg.exec('truncate jobs, chunks, documents restart identity cascade');
});

async function seedChunks(texts: string[]): Promise<void> {
  const [document] = (
    await pg.query<{ id: string }>(
      `insert into documents (title, storage_key, hash) values ('Tài liệu', 'documents/a.md', 'hash-a') returning id`,
    )
  ).rows;
  if (!document) throw new Error('seed failed');
  for (const [ord, text] of texts.entries()) {
    await pg.query('insert into chunks (document_id, ord, text) values ($1, $2, $3)', [
      document.id,
      ord,
      text,
    ]);
  }
}

function fakeEmbedder() {
  const calls: string[][] = [];
  const embed = async (texts: string[]) => {
    calls.push(texts);
    return texts.map(() => [1, 2, 3, 4]);
  };
  return { calls, embed };
}

async function jobState(jobId: string): Promise<string> {
  const [row] = (await pg.query<{ state: string }>('select state from jobs where id = $1', [jobId]))
    .rows;
  return row?.state ?? 'missing';
}

async function embeddedCount(): Promise<number> {
  const [row] = (
    await pg.query<{ count: number }>(
      "select count(*)::int as count from chunks where embed_model = 'qwen3-embedding'",
    )
  ).rows;
  return row?.count ?? 0;
}

describe('reindex theo job và lease', () => {
  it('walks through batches, returns the job to the queue, then closes it', async () => {
    const db = drizzle(pg) as unknown as Db;
    await seedChunks(['một', 'hai', 'ba', 'bốn', 'năm']);
    const jobId = await enqueueReindexJob({ db });

    const firstLease = await claimReindexJob({ jobId, db });
    expect(firstLease).not.toBeNull();
    const first = await runReindexBatch({
      jobId,
      leaseOwner: firstLease as string,
      embed: fakeEmbedder().embed,
      db,
      batchSize: 2,
      dim: 4,
    });
    expect(first).toMatchObject({ processed: 2, remaining: 3, done: false });
    expect(await jobState(jobId)).toBe('queued');

    const secondLease = await claimReindexJob({ jobId, db });
    const second = await runReindexBatch({
      jobId,
      leaseOwner: secondLease as string,
      embed: fakeEmbedder().embed,
      db,
      batchSize: 2,
      dim: 4,
    });
    expect(second).toMatchObject({ processed: 2, remaining: 1, done: false });

    const thirdLease = await claimReindexJob({ jobId, db });
    const third = await runReindexBatch({
      jobId,
      leaseOwner: thirdLease as string,
      embed: fakeEmbedder().embed,
      db,
      batchSize: 2,
      dim: 4,
    });
    expect(third).toMatchObject({ processed: 1, remaining: 0, done: true });
    expect(await jobState(jobId)).toBe('done');
    expect(await embeddedCount()).toBe(5);
  });

  it('reuses the same job for the same model', async () => {
    const db = drizzle(pg) as unknown as Db;
    const first = await enqueueReindexJob({ db });
    const second = await enqueueReindexJob({ db });

    expect(second).toBe(first);
    const [row] = (await pg.query<{ count: number }>('select count(*)::int as count from jobs'))
      .rows;
    expect(row?.count).toBe(1);
  });

  it('fails the job when the provider refuses', async () => {
    const db = drizzle(pg) as unknown as Db;
    await seedChunks(['một']);
    const jobId = await enqueueReindexJob({ db });
    const leaseOwner = await claimReindexJob({ jobId, db });

    await expect(
      runReindexBatch({
        jobId,
        leaseOwner: leaseOwner as string,
        embed: async () => {
          throw new EmbedError('embed_failed: HTTP 503', 503);
        },
        db,
        dim: 4,
      }),
    ).rejects.toThrow(/embed_failed/);

    expect(await jobState(jobId)).toBe('failed');
  });

  it('closes the job immediately when nothing is stale', async () => {
    const db = drizzle(pg) as unknown as Db;
    await seedChunks(['một']);
    await pg.query("update chunks set embed_model = 'qwen3-embedding', embedding = '[1,2,3,4]'");
    const jobId = await enqueueReindexJob({ db });
    const leaseOwner = await claimReindexJob({ jobId, db });

    const report = await runReindexBatch({
      jobId,
      leaseOwner: leaseOwner as string,
      embed: fakeEmbedder().embed,
      db,
      dim: 4,
    });

    expect(report).toMatchObject({ processed: 0, remaining: 0, done: true });
    expect(await jobState(jobId)).toBe('done');
  });
});
