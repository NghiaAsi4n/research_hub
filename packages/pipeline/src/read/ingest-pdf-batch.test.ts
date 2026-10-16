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
  it('reads large PDFs by byte range and writes combined Markdown as chunks with source metrics', async () => {
    const pageJob: ClaimedPdfJob = {
      id: 'job-large',
      idemKey: 'ingest:pdf:large',
      leaseOwner: 'worker-1',
      payload: {
        documentId: 'doc-large',
        storageKey: 'large.pdf',
        contentType: 'application/pdf',
        bytes: 32 * 1024 * 1024,
      },
    };
    const pdfSource = {
      length: 32 * 1024 * 1024,
      async readRange() {
        throw new Error('The PDF range extractor is injected in this test');
      },
    };
    const storedObjects = new Map<string, string>();
    let ready: Record<string, unknown> | undefined;
    let openedSource = false;
    let maxPages = 0;
    const jobs: PdfJobStore = {
      async claim() {
        return null;
      },
      async finish() {
        return true;
      },
    };
    const documents: DocumentStore = {
      async markReady(input) {
        ready = { ...input };
      },
      async markUnreadable() {
        throw new Error('Unexpected unreadable PDF');
      },
      async markFailed() {
        throw new Error('Unexpected PDF failure');
      },
    };

    const outcome = await ingestPdfBatch({
      job: pageJob,
      jobs,
      documents,
      openObject: async () => {
        openedSource = true;
        return pdfSource;
      },
      extractRanges: async (_source, range) => {
        maxPages = range.maxPages;
        return {
          kind: 'ok',
          pageCount: 1,
          pages: [
            {
              pageNumber: 1,
              lines: [
                {
                  text: 'Contract terms provide a sufficiently long readable test fixture.',
                  fontSize: 11,
                  y: 700,
                },
              ],
            },
          ],
          textLength: 64,
        };
      },
      writeObject: async (key, value) => {
        storedObjects.set(key, value);
      },
      readObjectChunks: async function* (key) {
        const bytes = new TextEncoder().encode(storedObjects.get(key) ?? '');
        yield bytes.subarray(0, 10);
        yield bytes.subarray(10);
      },
      writeObjectChunks: async (key, chunks) => {
        const decoded: string[] = [];
        let bytes = 0;
        for await (const chunk of chunks) {
          bytes += chunk.byteLength;
          decoded.push(new TextDecoder().decode(chunk));
        }
        storedObjects.set(key, decoded.join(''));
        return bytes;
      },
    });

    expect(outcome).toBe('ready');
    expect(openedSource).toBe(true);
    expect(maxPages).toBe(1);
    expect(storedObjects.get('large.pdf.md')).toContain('<!-- page: 1 -->');
    expect(ready).toBeDefined();
    const saved = ready as Record<string, unknown>;
    expect(saved.bytes).toBe(
      new TextEncoder().encode(storedObjects.get('large.pdf.md')).byteLength,
    );
    expect(saved.meta).toMatchObject({ sourceBytes: 32 * 1024 * 1024, pageCount: 1 });
    expect((saved.meta as { readMs: number }).readMs).toBeGreaterThanOrEqual(0);
  });

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
