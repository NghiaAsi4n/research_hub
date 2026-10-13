import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getDb } from './db/client';
import { documents, jobs, sources } from './db/schema';
import { deterministicUuid, sha256Hex } from './ingest';
import { createIngestStore } from './ingest-store';

// Test tích hợp cho đường ghi DB của T3 — thứ mà test bằng store giả không chứng minh được: mệnh đề
// `ON CONFLICT ... DO UPDATE ... RETURNING` của Drizzle có khớp chỉ mục duy nhất trong Neon hay không.
//
// Chỉ chạy khi bật `INGEST_DB_TEST=1`, vì nó ghi vào project Neon thật (dù có dọn dẹp ở cuối). CI
// không đặt biến này nên `pnpm test` vẫn thuần tuý, không chạm mạng:
//
//   INGEST_DB_TEST=1 pnpm --filter @research-hub/core exec vitest run src/ingest-store.integration.test.ts
//
// Biến môi trường lấy từ `.env.local` ở gốc repo (cùng file Next.js dùng khi chạy ở máy).

const REPO_ENV_FILE = new URL('../../../.env.local', import.meta.url);

function loadEnvFile(): void {
  try {
    const text = readFileSync(REPO_ENV_FILE, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }
      const separator = trimmed.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      // `.env.local` bọc giá trị trong nháy kép (Next.js tự bỏ, bộ đọc này phải bỏ theo).
      const raw = trimmed.slice(separator + 1).trim();
      const quoted =
        raw.length >= 2 &&
        ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")));
      process.env[key] ??= quoted ? raw.slice(1, -1) : raw;
    }
  } catch {
    // Không có `.env.local`: bỏ qua, bên dưới sẽ tự skip.
  }
}

if (process.env.INGEST_DB_TEST === '1') {
  loadEnvFile();
}

const enabled = process.env.INGEST_DB_TEST === '1' && Boolean(process.env.DATABASE_URL);
const describeDb = enabled ? describe : describe.skip;

// Nguồn đánh dấu riêng để có thể dọn sạch và không đụng dữ liệu thật.
const marker = `file://__t3-verify-${crypto.randomUUID()}.pdf`;
const sourceKey = `file|${marker}`;
const sourceIdentification = deterministicUuid(sourceKey);
const contentHash = sha256Hex(sourceKey);
const idemKey = `ingest:${contentHash}`;

describeDb('createIngestStore trên Postgres thật', () => {
  afterAll(async () => {
    const db = getDb();
    await db.delete(jobs).where(eq(jobs.idemKey, idemKey));
    await db.delete(documents).where(eq(documents.hash, contentHash));
    await db.delete(sources).where(eq(sources.url, marker));
  });

  it('gọi lại cùng một nguồn chỉ để lại một document và một job, và giữ khoá storage đã lưu', async () => {
    const store = createIngestStore();
    const db = getDb();

    const source = await store.upsertSource({
      id: sourceIdentification,
      kind: 'file',
      url: marker,
      domain: null,
    });
    expect(source.id).toBe(sourceIdentification);

    const first = await store.upsertDocument({
      sourceId: source.id,
      title: 'bản kiểm chứng T3',
      storageKey: `documents/verify/${marker}`,
      hash: contentHash,
    });

    // Lần thứ hai cố tình truyền khoá storage khác: upsert phải trả về khoá cũ đang nằm trong DB,
    // nếu không thì client sẽ đẩy file lên object mà bản ghi không trỏ tới.
    const second = await store.upsertDocument({
      sourceId: source.id,
      title: 'bản kiểm chứng T3 (ghi lại)',
      storageKey: `documents/verify/${marker}-lan-2`,
      hash: contentHash,
    });
    expect(second.id).toBe(first.id);
    expect(second.storageKey).toBe(first.storageKey);

    const firstJob = await store.upsertJob({
      type: 'ingest',
      idemKey,
      state: 'awaiting_upload',
      payload: { sourceId: source.id, documentId: first.id, storageKey: first.storageKey },
    });
    const secondJob = await store.upsertJob({
      type: 'ingest',
      idemKey,
      state: 'awaiting_upload',
      payload: { sourceId: source.id, documentId: first.id, storageKey: first.storageKey },
    });
    expect(secondJob.id).toBe(firstJob.id);

    const storedSources = await db.select().from(sources).where(eq(sources.url, marker));
    const storedDocuments = await db
      .select()
      .from(documents)
      .where(eq(documents.hash, contentHash));
    const storedJobs = await db.select().from(jobs).where(eq(jobs.idemKey, idemKey));
    expect(storedSources).toHaveLength(1);
    expect(storedDocuments).toHaveLength(1);
    expect(storedJobs).toHaveLength(1);

    const ready = await store.markUploadComplete({ jobId: firstJob.id, bytes: 4242 });
    expect(ready).toEqual({ jobId: firstJob.id, documentId: first.id });
    await expect(store.markUploadComplete({ jobId: firstJob.id })).resolves.toBeNull();

    const [readyJob] = await db.select().from(jobs).where(eq(jobs.idemKey, idemKey));
    const [readyDocument] = await db
      .select()
      .from(documents)
      .where(eq(documents.hash, contentHash));
    expect(readyJob?.state).toBe('queued');
    expect(readyDocument?.bytes).toBe(4242);
  });
});
