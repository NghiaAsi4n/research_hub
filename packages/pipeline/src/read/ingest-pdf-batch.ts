import type { DocumentStore } from '@research-hub/core/document-store';
import type { ClaimedPdfJob, PdfJobStore } from '@research-hub/core/ingest-job-store';
import {
  getObjectBytes,
  getObjectChunks,
  getObjectRange,
  MULTIPART_THRESHOLD_BYTES,
  markdownKeyFor,
  objectSize,
  putObject,
  putObjectChunks,
} from '@research-hub/core/storage';
import { markdownFromPdfPages } from './pdf-markdown';
import {
  extractPdfText,
  extractPdfTextFromRanges,
  type PdfByteRangeSource,
  type PdfTextResult,
} from './pdf-text';

export const PDF_PAGES_PER_JOB = 8;

export type PdfBatchInput = {
  job: ClaimedPdfJob;
  jobs: PdfJobStore;
  documents: DocumentStore;
  readObject?: (key: string) => Promise<Uint8Array>;
  openObject?: (key: string) => Promise<PdfByteRangeSource>;
  readObjectChunks?: (key: string) => AsyncIterable<Uint8Array>;
  writeObject?: (key: string, value: string) => Promise<void>;
  writeObjectChunks?: (
    key: string,
    chunks: AsyncIterable<Uint8Array>,
    contentType: string,
  ) => Promise<number>;
  extract?: (
    bytes: Uint8Array,
    range: { startPage: number; maxPages: number; deadlineAt?: number },
  ) => Promise<PdfTextResult>;
  extractRanges?: (
    source: PdfByteRangeSource,
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
  const openObject =
    input.openObject ??
    (async (key: string): Promise<PdfByteRangeSource> => {
      const length = await objectSize(key);
      if (length === undefined) throw new Error(`Object Storage không trả kích thước: ${key}`);
      return {
        length,
        readRange: (begin, end, signal) => getObjectRange(key, begin, end, signal),
      };
    });
  const readObjectChunks = input.readObjectChunks ?? getObjectChunks;
  const writeObjectChunks = input.writeObjectChunks ?? putObjectChunks;
  const extract = input.extract ?? extractPdfText;
  const extractRanges = input.extractRanges ?? extractPdfTextFromRanges;
  const now = input.now ?? Date.now;
  const started = now();
  let sourceBytes = job.payload.bytes;

  let result: PdfTextResult;
  const range = {
    startPage,
    maxPages: (job.payload.bytes ?? 0) > MULTIPART_THRESHOLD_BYTES ? 1 : PDF_PAGES_PER_JOB,
    deadlineAt: Date.now() + 210_000,
  };
  if (input.readObject === undefined || input.openObject !== undefined) {
    try {
      const source = await openObject(storageKey);
      sourceBytes = source.length;
      result = await extractRanges(source, range);
    } catch (error) {
      result = { kind: 'error', reason: 'storage_read', detail: String(error) };
    }
  } else {
    try {
      const bytes = await readObject(storageKey);
      sourceBytes = bytes.byteLength;
      result = await extract(bytes, range);
    } catch (error) {
      result = { kind: 'error', reason: 'extract_failed', detail: String(error) };
    }
  }
  if (result.kind === 'error') {
    await input.documents.markFailed({
      id: documentId,
      reason: result.reason,
      meta: { detail: result.detail, readMs: now() - started, sourceBytes },
    });
    await input.jobs.finish(job);
    return 'failed';
  }
  if (result.kind === 'unreadable') {
    await input.documents.markUnreadable({
      id: documentId,
      reason: result.reason,
      meta: { pages: result.pageCount, readMs: now() - started, sourceBytes },
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
      meta: { pages: result.pageCount, textLength, readMs: now() - started, sourceBytes },
    });
    await input.jobs.finish(job);
    return 'unreadable';
  }
  let markdownBytes: number;
  if (input.readObject !== undefined && input.readObjectChunks === undefined) {
    const fragments: string[] = [];
    for (const key of parts) fragments.push(new TextDecoder().decode(await input.readObject(key)));
    const fullMarkdown = fragments.join('\n\n');
    await writeObject(markdownKeyFor(storageKey), fullMarkdown);
    markdownBytes = new TextEncoder().encode(fullMarkdown).byteLength;
  } else {
    const separator = new TextEncoder().encode('\n\n');
    async function* markdownChunks(): AsyncGenerator<Uint8Array> {
      for (let index = 0; index < parts.length; index += 1) {
        if (index > 0) yield separator;
        const key = parts[index];
        if (key !== undefined) yield* readObjectChunks(key);
      }
    }
    markdownBytes = await writeObjectChunks(
      markdownKeyFor(storageKey),
      markdownChunks(),
      'text/markdown; charset=utf-8',
    );
  }
  await input.documents.markReady({
    id: documentId,
    title: job.payload.title ?? result.title,
    bytes: markdownBytes,
    pages: result.pageCount,
    meta: {
      readMs: now() - started,
      sourceBytes,
      pageCount: result.pageCount,
      textLength,
      sourceType: 'pdf',
      batches: parts.length,
    },
  });
  if (!(await input.jobs.finish(job))) throw new Error('PDF job lease lost before completion');
  return 'ready';
}
