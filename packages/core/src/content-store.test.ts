import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContentStore } from './content-store';
import type { Db } from './db/client';
import { createIngestStore } from './ingest-store';

const pg = new PGlite();
const hash = 'a'.repeat(64);
const ids = Array.from({ length: 4 }, () => crypto.randomUUID());

beforeAll(async () => {
  for (const file of ['0000_worthless_power_man.sql', '0001_magical_elektra.sql']) {
    const sql = readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (
        /^(?:CREATE TABLE|ALTER TABLE) "(?:sources|documents|jobs)"/m.test(statement) ||
        /^CREATE (?:UNIQUE )?INDEX .* ON "(?:sources|documents|jobs)"/m.test(statement)
      ) {
        await pg.exec(statement);
      }
    }
  }
  await pg.exec(
    readFileSync(new URL('../drizzle/0002_content_sources.sql', import.meta.url), 'utf8'),
  );
}, 20_000);
afterAll(() => pg.close());

describe('canonical content on PostgreSQL', () => {
  it('lets only one concurrent-looking URL request publish a pending content job', async () => {
    const db = drizzle(pg) as unknown as Db;
    const content = createContentStore(db);
    const [job] = (
      await pg.query<{ id: string }>(
        "insert into jobs (type,state,idem_key,payload) values ('ingest','queued',$1,'{}') returning id",
        [`ingest:content:${'d'.repeat(64)}`],
      )
    ).rows;
    expect(job).toBeDefined();
    const first = await content.claimHtmlJob(job?.id as string);
    const second = await content.claimHtmlJob(job?.id as string);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBeNull();
    await content.releaseHtmlJob(job?.id as string, first as string);
    const retried = await content.claimHtmlJob(job?.id as string);
    expect(retried).not.toBeNull();
    await expect(content.completeHtmlJob(job?.id as string, first as string)).rejects.toThrow(
      'lease was lost',
    );
    await content.completeHtmlJob(job?.id as string, retried as string);
    expect(await content.claimHtmlJob(job?.id as string)).toBeNull();
    await pg.query('delete from jobs where id = $1', [job?.id]);
  });
  it('registers two different URLs with identical clean content as one document and one job', async () => {
    // Both Drizzle drivers execute the same PostgreSQL query builders used by these stores.
    const db = drizzle(pg) as unknown as Db;
    const content = createContentStore(db);
    const ingest = createIngestStore(db);
    const sourceIds = [crypto.randomUUID(), crypto.randomUUID()];
    const canonicalHash = 'c'.repeat(64);
    const docIds = [];
    const jobIds = [];
    for (const sourceId of sourceIds) {
      await ingest.upsertSource({
        id: sourceId,
        kind: 'url',
        url: `https://example.com/${sourceId}`,
        domain: 'example.com',
      });
      const doc = await content.register({
        sourceId,
        title: 'Same clean article',
        storageKey: sourceId,
        hash: canonicalHash,
      });
      docIds.push(doc.id);
      const job = await ingest.upsertJob({
        type: 'ingest',
        state: 'queued',
        idemKey: `ingest:content:${canonicalHash}`,
        payload: { documentId: doc.id },
      });
      jobIds.push(job.id);
    }
    expect(new Set(docIds).size).toBe(1);
    expect(new Set(jobIds).size).toBe(1);
    expect(await content.sources(docIds[0] as string)).toHaveLength(2);
    expect((await content.findBySource(sourceIds[1] as string))?.id).toBe(docIds[0]);
    await pg.query('delete from jobs where id = $1', [jobIds[0]]);
    await pg.query('delete from documents where id = $1', [docIds[0]]);
    await pg.query('delete from sources where id = any($1::uuid[])', [sourceIds]);
  });
  it('merges two pending documents, preserves both sources and resolves the old ID', async () => {
    for (let i = 0; i < 2; i++) {
      await pg.query("insert into sources (id,kind,url) values ($1,'url',$2)", [
        ids[i],
        `https://example.com/${i}`,
      ]);
      await pg.query(
        "insert into documents (id,source_id,title,storage_key,hash) values ($1,$2,'Title',$3,$4)",
        [ids[i + 2], ids[i], `doc-${i}`, `pending-${i}`],
      );
    }
    const finish = (id: string | undefined) =>
      pg.query<{ id: string }>('select rh_finish_document($1,$2,$3::jsonb) as id', [
        id,
        hash,
        JSON.stringify({ title: 'Clean title', bytes: 42 }),
      ]);
    const first = await finish(ids[2]);
    const second = await finish(ids[3]);
    expect(first.rows[0]?.id).toBe(ids[2]);
    expect(second.rows[0]?.id).toBe(ids[2]);
    expect((await pg.query('select * from documents')).rows).toHaveLength(1);
    expect((await pg.query('select * from document_sources')).rows).toHaveLength(2);
    expect((await pg.query('select * from document_aliases')).rows).toEqual([
      { id: ids[3], document_id: ids[2] },
    ]);
    expect((await finish(ids[3])).rows[0]?.id).toBe(ids[2]);
  });

  it('rejects rewriting a published document with different content', async () => {
    await expect(
      pg.query('select rh_finish_document($1,$2,$3::jsonb)', [ids[2], 'b'.repeat(64), '{}']),
    ).rejects.toThrow();
    expect((await pg.query('select hash from documents')).rows).toEqual([{ hash }]);
  });

});
