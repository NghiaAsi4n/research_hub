import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backfillContentHashes } from './backfill-hash';
import { contentHash } from './content-hash';
import { getDb } from './db/client';
import { documents, jobs, sources } from './db/schema';
import { deleteObject, markdownKeyFor, putObject } from './storage';

// Kiểm thử backfill hash trên branch staging cô lập. Hai tài liệu `ready` được gieo với hash
// kiểu cũ (hash nguồn) nhưng cùng một bản Markdown, đúng tình trạng dữ liệu trước T9.
// Backfill phải đổi hash sang hash nội dung, gộp bản trùng, và giữ đủ nguồn.
//
// Bật bằng PHASE1_LIVE_TEST=1 cùng PHASE1_LIVE_EXPECTED_BRANCH; branch lệch sẽ dừng ngay,
// nên không thể vô tình chạy trên production.

const enabled = process.env.PHASE1_LIVE_TEST === '1' && Boolean(process.env.DATABASE_URL);
const live = enabled ? describe : describe.skip;
const expectedBranchId = process.env.PHASE1_LIVE_EXPECTED_BRANCH;

const marker = randomUUID();
const cleanMarkdown = `# Backfill fixture ${marker}\n\nSame clean content from two legacy sources.\n`;
const canonicalId = randomUUID();
const duplicateId = randomUUID();
const canonicalSource = randomUUID();
const duplicateSource = randomUUID();
const canonicalKey = `documents/backfill/${marker}-canonical.md`;
const duplicateKey = `documents/backfill/${marker}-duplicate.md`;
const legacyHashes = [
  `a${marker.replace(/-/g, '').slice(0, 63)}`,
  `b${marker.replace(/-/g, '').slice(0, 63)}`,
];
let branchVerified = false;

async function seedDocument(input: {
  id: string;
  sourceId: string;
  storageKey: string;
  hash: string;
  minutesAgo: number;
}) {
  const db = getDb();
  await db.execute(sql`
    insert into sources (id, kind, url) values (${input.sourceId}::uuid, 'url', ${`https://example.com/${input.sourceId}`})
  `);
  await db.execute(sql`
    insert into documents (id, source_id, title, storage_key, hash, status, created_at)
    values (${input.id}::uuid, ${input.sourceId}::uuid, ${`Backfill ${marker}`},
      ${input.storageKey}, ${input.hash}, 'ready', now() - make_interval(mins => ${input.minutesAgo}))
  `);
  await db.execute(sql`
    insert into document_sources (document_id, source_id) values (${input.id}::uuid, ${input.sourceId}::uuid)
  `);
  await db.execute(sql`
    insert into jobs (type, state, idem_key, payload)
    values ('ingest', 'done', ${`ingest:legacy:${input.id}`},
      ${JSON.stringify({ documentId: input.id })}::jsonb)
  `);
  await putObject(markdownKeyFor(input.storageKey), cleanMarkdown, 'text/markdown; charset=utf-8');
}

live('Hash backfill on isolated Neon staging', () => {
  beforeAll(async () => {
    if (!expectedBranchId) throw new Error('PHASE1_LIVE_EXPECTED_BRANCH is required');
    const result = await getDb().execute(
      sql`select current_setting('neon.branch_id', true) as branch_id`,
    );
    const row = result.rows[0] as { branch_id?: string } | undefined;
    if (row?.branch_id !== expectedBranchId) {
      throw new Error('Refusing live backfill: connected Neon branch is not the expected staging');
    }
    branchVerified = true;
  }, 30_000);

  afterAll(async () => {
    if (!branchVerified) return;
    const db = getDb();
    await deleteObject(markdownKeyFor(canonicalKey)).catch(() => undefined);
    await deleteObject(markdownKeyFor(duplicateKey)).catch(() => undefined);
    await db.execute(
      sql`delete from jobs where payload->>'documentId' in (${canonicalId}, ${duplicateId})`,
    );
    await db.delete(documents).where(inArray(documents.id, [canonicalId, duplicateId]));
    await db.delete(sources).where(inArray(sources.id, [canonicalSource, duplicateSource]));
  });

  it('rewrites legacy source hashes and merges equal content', async () => {
    await seedDocument({
      id: canonicalId,
      sourceId: canonicalSource,
      storageKey: canonicalKey,
      hash: legacyHashes[0] as string,
      minutesAgo: 2,
    });
    await seedDocument({
      id: duplicateId,
      sourceId: duplicateSource,
      storageKey: duplicateKey,
      hash: legacyHashes[1] as string,
      minutesAgo: 1,
    });

    const fixtureIds: string[] = [canonicalId, duplicateId];
    const report = await backfillContentHashes({ limit: 500, dryRun: true });
    const planned = report.items.filter((item) => fixtureIds.includes(item.documentId));
    // Dry run chưa ghi hash mới, nên cả hai dòng đều báo "sẽ đổi hash"; việc gộp chỉ hiện ra
    // khi chạy thật, lúc bản đầu tiên đã mang hash nội dung.
    expect(planned.map((item) => item.status)).toEqual(['updated', 'updated']);
    expect(planned.map((item) => item.hash)).toEqual([
      contentHash(cleanMarkdown),
      contentHash(cleanMarkdown),
    ]);

    const applied = await backfillContentHashes({ limit: 500 });
    const touched = applied.items.filter((item) => fixtureIds.includes(item.documentId));
    expect(touched.map((item) => item.status)).toEqual(['updated', 'merged']);
    expect(touched[1]?.canonicalId).toBe(canonicalId);

    const remaining = await getDb().execute(
      sql`select id, hash from documents where id in (${canonicalId}::uuid, ${duplicateId}::uuid)`,
    );
    expect(remaining.rows).toEqual([{ id: canonicalId, hash: contentHash(cleanMarkdown) }]);

    const links = await getDb().execute(
      sql`select source_id from document_sources where document_id = ${canonicalId}::uuid order by source_id`,
    );
    expect(links.rows.map((row) => (row as { source_id: string }).source_id).sort()).toEqual(
      [canonicalSource, duplicateSource].sort(),
    );

    const alias = await getDb().execute(
      sql`select document_id from document_aliases where id = ${duplicateId}::uuid`,
    );
    expect(alias.rows).toEqual([{ document_id: canonicalId }]);

    const [job] = await getDb()
      .select()
      .from(jobs)
      .where(eq(jobs.idemKey, `ingest:legacy:${canonicalId}`));
    expect((job?.payload as { documentId?: string } | undefined)?.documentId).toBe(canonicalId);
  }, 120_000);
});
