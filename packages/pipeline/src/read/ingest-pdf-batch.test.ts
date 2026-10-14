import { readFileSync } from 'node:fs';
import type { DocumentStore } from '@research-hub/core/document-store';
import type {
  ClaimedPdfJob,
  PdfJobPayload,
  PdfJobStore,
} from '@research-hub/core/ingest-job-store';
import { describe, expect, it } from 'vitest';
import { ingestPdfBatch } from './ingest-pdf-batch';

describe('PDF jobs', () => {
  it('ingests a PDF larger than 4.5 MB across three page jobs and resumes from saved progress', async () => {
    const fixture = readFileSync(new URL('./__fixtures__/contract-3-pages.pdf', import.meta.url));
    const largePdf = new Uint8Array(5 * 1024 * 1024);
    largePdf.set(fixture);
    largePdf.fill(32, fixture.length);
    const objects = new Map<string, Uint8Array>([['large.pdf', largePdf]]);
    const queue: ClaimedPdfJob[] = [
      {
        id: 'job-1',
        idemKey: 'ingest:pdf',
        leaseOwner: 'worker-1',
        payload: {
          documentId: 'doc-1',
          storageKey: 'large.pdf',
          contentType: 'application/pdf',
          bytes: largePdf.byteLength,
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
            id: `job-${next.startPage}`,
            idemKey: `ingest:pdf:page:${next.startPage}`,
            leaseOwner: 'worker-1',
            payload: structuredClone(next),
          });
        expect(job.leaseOwner).toBe('worker-1');
        return true;
      },
    };
    let status = '';
    let pages = 0;
    const documents: DocumentStore = {
      async markReady(input) {
        status = 'ready';
        pages = input.pages ?? 0;
      },
      async markUnreadable() {
        status = 'unreadable';
      },
      async markFailed() {
        status = 'failed';
      },
    };
    const outcomes: string[] = [];
    while (true) {
      const job = await jobs.claim();
      if (!job) break;
      outcomes.push(
        await ingestPdfBatch({
          job,
          jobs,
          documents,
          readObject: async (key) => {
            const value = objects.get(key);
            if (!value) throw new Error(`Missing ${key}`);
            return value.slice();
          },
          writeObject: async (key, value) => {
            objects.set(key, new TextEncoder().encode(value));
          },
        }),
      );
    }
    expect(outcomes).toEqual(['continued', 'continued', 'ready']);
    expect(status).toBe('ready');
    expect(pages).toBe(3);
    const markdown = new TextDecoder().decode(objects.get('large.pdf.md'));
    expect(markdown).toContain('<!-- page: 1 -->');
    expect(markdown).toContain('<!-- page: 2 -->');
    expect(markdown).toContain('<!-- page: 3 -->');
    expect(markdown.indexOf('<!-- page: 1 -->')).toBeLessThan(markdown.indexOf('<!-- page: 3 -->'));
  });
});
