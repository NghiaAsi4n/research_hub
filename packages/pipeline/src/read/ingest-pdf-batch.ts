import type { DocumentStore } from '@research-hub/core/document-store';
import type { ClaimedPdfJob, PdfJobStore } from '@research-hub/core/ingest-job-store';
import {
  getObjectBytes,
  MULTIPART_THRESHOLD_BYTES,
  markdownKeyFor,
  putObject,
} from '@research-hub/core/storage';
import { markdownFromPdfPages } from './pdf-markdown';
import { extractPdfText, type PdfTextResult } from './pdf-text';

export const PDF_PAGES_PER_JOB = 8;

export type PdfBatchInput = {
  job: ClaimedPdfJob;
  jobs: PdfJobStore;
  documents: DocumentStore;
  readObject?: (key: string) => Promise<Uint8Array>;
  writeObject?: (key: string, value: string) => Promise<void>;
  extract?: (
    bytes: Uint8Array,
    range: { startPage: number; maxPages: number; deadlineAt?: number },
  ) => Promise<PdfTextResult>;
  now?: () => number;
};

export async function ingestPdfBatch(
  input: PdfBatchInput,
): Promise<'continued' | 'ready' | 'unreadable' | 'failed'> {
  const { job } = input;
  const { documentId, storageKey } = job.payload;
  const startPage = job.payload.startPage ?? 1;
  const previousParts = job.payload.parts ?? [];
  const previousLength = job.payload.textLength ?? 0;
  const readObject = input.readObject ?? getObjectBytes;
  const writeObject =
    input.writeObject ??
    ((key: string, value: string) =>
      putObject(key, value, 'text/markdown; charset=utf-8').then(() => undefined));
  const extract = input.extract ?? extractPdfText;
  const now = input.now ?? Date.now;
  const started = now();

  let result: PdfTextResult;
  try {
    result = await extract(await readObject(storageKey), {
      startPage,
      maxPages: (job.payload.bytes ?? 0) > MULTIPART_THRESHOLD_BYTES ? 1 : PDF_PAGES_PER_JOB,
      deadlineAt: Date.now() + 210_000,
    });
  } catch (error) {
    result = { kind: 'error', reason: 'extract_failed', detail: String(error) };
  }
  if (result.kind === 'error') {
    await input.documents.markFailed({
      id: documentId,
      reason: result.reason,
      meta: { detail: result.detail, readMs: now() - started },
    });
    await input.jobs.finish(job);
    return 'failed';
  }
  if (result.kind === 'unreadable') {
    await input.documents.markUnreadable({
      id: documentId,
      reason: result.reason,
      meta: { pages: result.pageCount, readMs: now() - started },
    });
    await input.jobs.finish(job);
    return 'unreadable';
  }

  const markdown = markdownFromPdfPages(result.pages);
  const partKey = `${storageKey}.page-${startPage}.md`;
  await writeObject(partKey, markdown);
  const parts = [...previousParts, partKey];
  const textLength = previousLength + result.textLength;
  const nextPage = startPage + result.pages.length;
  if (nextPage <= result.pageCount) {
    const saved = await input.jobs.finish(job, {
      documentId,
      storageKey,
      contentType: 'application/pdf',
      bytes: job.payload.bytes,
      startPage: nextPage,
      parts,
      textLength,
      title: job.payload.title ?? result.title,
    });
    if (!saved) throw new Error('PDF job lease lost before progress was saved');
    return 'continued';
  }
  if (textLength < 40) {
    await input.documents.markUnreadable({
      id: documentId,
      reason: 'no_text_layer',
      meta: { pages: result.pageCount, textLength, readMs: now() - started },
    });
    await input.jobs.finish(job);
    return 'unreadable';
  }
  const fragments = await Promise.all(
    parts.map(async (key) => new TextDecoder().decode(await readObject(key))),
  );
  const fullMarkdown = fragments.join('\n\n');
  await writeObject(markdownKeyFor(storageKey), fullMarkdown);
  await input.documents.markReady({
    id: documentId,
    title: job.payload.title ?? result.title,
    bytes: new TextEncoder().encode(fullMarkdown).byteLength,
    pages: result.pageCount,
    meta: {
      readMs: now() - started,
      pageCount: result.pageCount,
      textLength,
      sourceType: 'pdf',
      batches: parts.length,
    },
  });
  if (!(await input.jobs.finish(job))) throw new Error('PDF job lease lost before completion');
  return 'ready';
}
