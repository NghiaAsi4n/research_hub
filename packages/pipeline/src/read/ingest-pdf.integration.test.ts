import { existsSync, readFileSync } from 'node:fs';
import type { DocumentStore } from '@research-hub/core/document-store';
import { deleteObject, getObjectBytes, presignDownload, putObject } from '@research-hub/core/storage';
import { afterAll, describe, expect, it } from 'vitest';
import { USER_AGENT } from './fetch-html';
import { INGEST_BUDGET_MS } from './ingest-html';
import { ingestPdfDocument } from './ingest-pdf';
import { extractPdfText } from './pdf-text';

// Kiểm chứng sống cho T5: chạy trên một PDF thật tải từ mạng, và nếu có credential Object Storage
// trong `.env.local` thì đi trọn đường ingest (đọc file gốc → ghi bản Markdown → đọc lại).
//
// Chỉ chạy khi bật `INGEST_LIVE_TEST=1`, vì nó cần mạng và ghi vào bucket thật (có dọn dẹp ở cuối).
// CI không đặt biến này nên `pnpm test` vẫn thuần tuý, không chạm mạng:
//
//   INGEST_LIVE_TEST=1 INGEST_LIVE_PDF_URL="<url pdf công khai>" \
//     pnpm --filter @research-hub/pipeline exec vitest run src/read/ingest-pdf.integration.test.ts
//
// Trần 4.5 MB là giới hạn body của Vercel Hobby mà plan mục 8 lấy làm mốc cho một lượt ingest.

// Từ `packages/pipeline/src/read/` lên gốc repo là bốn cấp.
const REPO_ENV_FILE = new URL('../../../../.env.local', import.meta.url);
const MAX_INGEST_BYTES = 4.5 * 1024 * 1024;

function loadEnvFile(): void {
  if (!existsSync(REPO_ENV_FILE)) {
    return;
  }
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
    const raw = trimmed.slice(separator + 1).trim();
    const quoted =
      raw.length >= 2 &&
      ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")));
    process.env[key] ??= quoted ? raw.slice(1, -1) : raw;
  }
}

const live = process.env.INGEST_LIVE_TEST === '1';
const describeLive = live ? describe : describe.skip;
const pdfUrl = process.env.INGEST_LIVE_PDF_URL ?? '';

if (live) {
  loadEnvFile();
}

const storageReady =
  Boolean(process.env.AWS_ENDPOINT_URL_S3) &&
  Boolean(process.env.AWS_ACCESS_KEY_ID) &&
  Boolean(process.env.AWS_SECRET_ACCESS_KEY) &&
  Boolean(process.env.OBJECT_STORAGE_BUCKET);

const marker = `__t5-verify-${crypto.randomUUID()}`;
const storageKey = `documents/verify/${marker}.pdf`;
const markdownKey = `${storageKey}.md`;

// Không có credential thì bỏ qua hẳn lượt kiểm chứng Object Storage, để báo cáo không nói quá.
const itWithStorage = storageReady ? it : it.skip;

async function downloadPdf(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Tải PDF thất bại: HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

describeLive('kiểm chứng sống T5 trên PDF thật', () => {
  afterAll(async () => {
    if (!storageReady) {
      return;
    }
    await deleteObject(storageKey).catch(() => undefined);
    await deleteObject(markdownKey).catch(() => undefined);
  });

  it('trích được lớp văn bản của PDF thật trong ngân sách 300 giây', async () => {
    expect(pdfUrl).not.toBe('');
    const bytes = await downloadPdf(pdfUrl);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(bytes.byteLength).toBeLessThan(MAX_INGEST_BYTES);

    const startedAt = Date.now();
    const result = await extractPdfText(bytes);
    const elapsed = Date.now() - startedAt;

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') {
      return;
    }
    expect(result.pageCount).toBeGreaterThan(0);
    expect(result.pages.map((page) => page.pageNumber)).toEqual(
      Array.from({ length: result.pageCount }, (_, index) => index + 1),
    );
    expect(result.textLength).toBeGreaterThan(500);
    expect(elapsed).toBeLessThan(INGEST_BUDGET_MS);
  });

  itWithStorage('đi trọn đường ingest qua Object Storage thật và đọc lại bản Markdown', async () => {
    const bytes = await downloadPdf(pdfUrl);
    await putObject(storageKey, bytes, 'application/pdf');

    const ready: Array<Record<string, unknown>> = [];
    const documents: DocumentStore = {
      async markReady(input) {
        ready.push({ ...input });
      },
      async markUnreadable(input) {
        throw new Error(`Không mong đợi unreadable: ${JSON.stringify(input)}`);
      },
      async markFailed(input) {
        throw new Error(`Không mong đợi failed: ${JSON.stringify(input)}`);
      },
    };

    const outcome = await ingestPdfDocument({
      documentId: crypto.randomUUID(),
      storageKey,
      documents,
      titleHint: 'kiem-chung-t5.pdf',
    });

    expect(outcome.kind).toBe('ready');
    if (outcome.kind !== 'ready') {
      return;
    }
    expect(outcome.pages).toBeGreaterThan(0);
    expect(outcome.readMs).toBeLessThan(INGEST_BUDGET_MS);
    expect(ready[0]).toMatchObject({ pages: outcome.pages });

    // Bản Markdown phải nằm thật trên Object Storage, không chỉ được báo là đã ghi.
    const markdown = new TextDecoder().decode(await getObjectBytes(markdownKey));
    expect(markdown).toContain('<!-- page: 1 -->');
    expect(markdown).toContain(`<!-- page: ${outcome.pages} -->`);

    const head = await fetch(await presignDownload(markdownKey));
    expect(head.status).toBe(200);
    await head.arrayBuffer();
  });
});
