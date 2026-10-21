import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { backfillContentHashes } from './backfill-hash';
import type { Db } from './db/client';

// Backfill chỉ dùng câu SQL và hàm plpgsql, nên PGlite là môi trường đủ để kiểm tra
// đổi hash, gộp bản trùng, và tính lặp lại của lần chạy thứ hai.

const pg = new PGlite();

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
  for (const file of [
    '0002_content_sources.sql',
    '0003_reader_state.sql',
    '0004_backfill_hash.sql',
  ]) {
    await pg.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  }
}, 20_000);
afterAll(() => pg.close());

beforeEach(async () => {
  await pg.exec(
    `truncate documents, sources, jobs, document_sources, document_aliases,
     reading_progress, highlights restart identity cascade`,
  );
});

const legacyHash = 'a'.repeat(64);
const contentHash = 'b'.repeat(64);

async function seedReadyDocument(input: {
  id: string;
  sourceId: string;
  storageKey: string;
  hash: string;
  createdAt?: string;
}) {
  await pg.query(
    "insert into sources (id, kind, url) values ($1, 'url', $2) on conflict do nothing",
    [input.sourceId, `https://example.com/${input.sourceId}`],
  );
  await pg.query(
    `insert into documents (id, source_id, title, storage_key, hash, status, created_at)
     values ($1, $2, 'Legacy document', $3, $4, 'ready', coalesce($5::timestamptz, now()))`,
    [input.id, input.sourceId, input.storageKey, input.hash, input.createdAt ?? null],
  );
  await pg.query(
    'insert into document_sources (document_id, source_id) values ($1, $2) on conflict do nothing',
    [input.id, input.sourceId],
  );
}

describe('content hash backfill', () => {
  it('replaces a legacy source hash with the hash of the stored Markdown, then is idempotent', async () => {
    const db = drizzle(pg) as unknown as Db;
    const documentId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    await seedReadyDocument({
      id: documentId,
      sourceId,
      storageKey: `documents/legacy-${documentId}.md`,
      hash: legacyHash,
      createdAt: '2026-01-01T00:00:00Z',
    });

    const first = await backfillContentHashes({
      db,
      hashMarkdown: async () => contentHash,
    });
    expect(first.updated).toBe(1);
    expect(first.items[0]).toMatchObject({ documentId, status: 'updated', hash: contentHash });

    const [row] = (
      await pg.query<{ hash: string }>('select hash from documents where id = $1', [documentId])
    ).rows;
    expect(row?.hash).toBe(contentHash);

    const second = await backfillContentHashes({ db, hashMarkdown: async () => contentHash });
    expect(second.unchanged).toBe(1);
    expect(second.updated).toBe(0);
    expect(second.nextCursor).toEqual({ createdAt: '2026-01-01T00:00:00.000Z', id: documentId });
    expect(second.remaining).toBe(false);
  });

  it('folds a legacy duplicate into the canonical row and keeps sources, progress and jobs', async () => {
    const db = drizzle(pg) as unknown as Db;
    const canonicalId = crypto.randomUUID();
    const duplicateId = crypto.randomUUID();
    const canonicalSource = crypto.randomUUID();
    const duplicateSource = crypto.randomUUID();
    const canonicalKey = `documents/canonical-${canonicalId}.md`;
    const duplicateKey = `documents/duplicate-${duplicateId}.md`;
    await seedReadyDocument({
      id: canonicalId,
      sourceId: canonicalSource,
      storageKey: canonicalKey,
      hash: contentHash,
      createdAt: '2026-02-01T00:00:00Z',
    });
    await seedReadyDocument({
      id: duplicateId,
      sourceId: duplicateSource,
      storageKey: duplicateKey,
      hash: 'd'.repeat(64),
      createdAt: '2026-02-02T00:00:00Z',
    });
    await pg.query(
      "insert into reading_progress (document_id, user_id, ratio) values ($1, 'user-1', 0.5)",
      [duplicateId],
    );
    const [job] = (
      await pg.query<{ id: string }>(
        `insert into jobs (type, state, idem_key, payload)
         values ('ingest', 'done', $1, $2::jsonb) returning id`,
        ['ingest:legacy-duplicate', JSON.stringify({ documentId: duplicateId })],
      )
    ).rows;

    const report = await backfillContentHashes({ db, hashMarkdown: async () => contentHash });
    expect(report).toMatchObject({ updated: 0, merged: 1, unchanged: 1, skipped: 0 });

    const remaining = await pg.query<{ id: string }>(
      'select id from documents where id in ($1, $2)',
      [canonicalId, duplicateId],
    );
    expect(remaining.rows.map((row) => row.id)).toEqual([canonicalId]);

    const links = await pg.query<{ source_id: string }>(
      'select source_id from document_sources where document_id = $1 order by source_id',
      [canonicalId],
    );
    expect(links.rows.map((row) => row.source_id).sort()).toEqual(
      [canonicalSource, duplicateSource].sort(),
    );

    const [alias] = (
      await pg.query<{ document_id: string }>(
        'select document_id from document_aliases where id = $1',
        [duplicateId],
      )
    ).rows;
    expect(alias?.document_id).toBe(canonicalId);

    const progress = await pg.query<{ document_id: string }>(
      "select document_id from reading_progress where user_id = 'user-1'",
    );
    expect(progress.rows.map((row) => row.document_id)).toEqual([canonicalId]);

    const updatedJob = await pg.query<{ payload: { documentId: string }; idem_key: string }>(
      'select payload, idem_key from jobs where id = $1',
      [job?.id],
    );
    expect(updatedJob.rows[0]?.payload.documentId).toBe(canonicalId);
    expect(updatedJob.rows[0]?.idem_key).toContain(contentHash);
  });

  it('skips a document whose Markdown cannot be read and leaves its hash untouched', async () => {
    const db = drizzle(pg) as unknown as Db;
    const documentId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    await seedReadyDocument({
      id: documentId,
      sourceId,
      storageKey: `documents/missing-${documentId}.md`,
      hash: legacyHash,
      createdAt: '2026-03-01T00:00:00Z',
    });

    const report = await backfillContentHashes({
      db,
      hashMarkdown: async () => {
        throw new Error('object not found');
      },
    });
    const item = report.items.find((entry) => entry.documentId === documentId);
    expect(item).toMatchObject({ status: 'skipped', reason: 'markdown_unreadable' });
    const [row] = (
      await pg.query<{ hash: string }>('select hash from documents where id = $1', [documentId])
    ).rows;
    expect(row?.hash).toBe(legacyHash);
  });
});
