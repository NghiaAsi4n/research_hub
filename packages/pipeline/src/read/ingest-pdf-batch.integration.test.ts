import { existsSync, readFileSync } from 'node:fs';
import type { DocumentStore } from '@research-hub/core/document-store';
import type {
  ClaimedPdfJob,
  PdfJobPayload,
  PdfJobStore,
} from '@research-hub/core/ingest-job-store';
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  deleteObject,
  getObjectBytes,
  listMultipartParts,
  MULTIPART_PART_BYTES,
  presignMultipartPart,
} from '@research-hub/core/storage';
import { afterAll, describe, expect, it } from 'vitest';
import { ingestPdfBatch } from './ingest-pdf-batch';

const envFile = new URL('../../../../.env.local', import.meta.url);
if (process.env.INGEST_LIVE_TEST === '1' && existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match?.[1]) process.env[match[1]] ??= match[2]?.replace(/^['"]|['"]$/g, '');
  }
}
const live =
  process.env.INGEST_LIVE_TEST === '1' &&
  [
    'AWS_ENDPOINT_URL_S3',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'OBJECT_STORAGE_BUCKET',
  ].every((name) => Boolean(process.env[name]));
const describeLive = live ? describe : describe.skip;
const key = `documents/verify/t6-${crypto.randomUUID()}.pdf`;

describeLive('multipart Object Storage and PDF jobs', () => {
  afterAll(async () => {
    await Promise.all(
      [key, `${key}.md`, ...[1, 2, 3].map((n) => `${key}.page-${n}.md`)].map((objectKey) =>
        deleteObject(objectKey).catch(() => undefined),
      ),
    );
  });

  it('uploads a >4.5 MB PDF using signed parts and ingests it in three jobs', async () => {
    const fixture = readFileSync(new URL('./__fixtures__/contract-3-pages.pdf', import.meta.url));
    const bytes = new Uint8Array(MULTIPART_PART_BYTES + 1024);
    bytes.set(fixture);
    bytes.fill(32, fixture.length);
    const uploadId = await createMultipartUpload(key, 'application/pdf');
    try {
      for (let partNumber = 1; partNumber <= 2; partNumber += 1) {
        const start = (partNumber - 1) * MULTIPART_PART_BYTES;
        const url = await presignMultipartPart(key, uploadId, partNumber);
        const response = await fetch(url, {
          method: 'PUT',
          body: bytes.slice(start, start + MULTIPART_PART_BYTES),
        });
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
      }
      const listed = await listMultipartParts(key, uploadId);
      expect(listed.map((part) => part.Size)).toEqual([MULTIPART_PART_BYTES, 1024]);
      await completeMultipartUpload(
        key,
        uploadId,
        listed.map((part) => ({
          partNumber: part.PartNumber as number,
          etag: part.ETag as string,
        })),
      );
      expect((await getObjectBytes(key)).byteLength).toBe(bytes.byteLength);
    } catch (error) {
      await abortMultipartUpload(key, uploadId).catch(() => undefined);
      throw error;
    }

    const queue: ClaimedPdfJob[] = [
      {
        id: crypto.randomUUID(),
        idemKey: 'ingest:live-t6',
        leaseOwner: 'test-worker',
        payload: {
          documentId: crypto.randomUUID(),
          storageKey: key,
          contentType: 'application/pdf',
          bytes: bytes.byteLength,
        },
      },
    ];
    const jobs: PdfJobStore = {
      async claim() {
        return queue.shift() ?? null;
      },
      async finish(job, next?: PdfJobPayload) {
        if (next)
          queue.push({
            id: crypto.randomUUID(),
            idemKey: `${job.idemKey}:next`,
            leaseOwner: 'test-worker',
            payload: next,
          });
        return true;
      },
    };
    let readyPages = 0;
    const documents: DocumentStore = {
      async markReady(input) {
        readyPages = input.pages ?? 0;
      },
      async markUnreadable() {
        throw new Error('Unexpected unreadable PDF');
      },
      async markFailed() {
        throw new Error('Unexpected PDF failure');
      },
    };
    const outcomes: string[] = [];
    const durations: number[] = [];
    while (true) {
      const job = await jobs.claim();
      if (!job) break;
      const started = performance.now();
      outcomes.push(await ingestPdfBatch({ job, jobs, documents }));
      durations.push(performance.now() - started);
    }
    expect(outcomes).toEqual(['continued', 'continued', 'ready']);
    expect(Math.max(...durations)).toBeLessThan(300_000);
    expect(readyPages).toBe(3);
    const markdown = new TextDecoder().decode(await getObjectBytes(`${key}.md`));
    expect(markdown).toContain('<!-- page: 3 -->');
  }, 120_000);
});
