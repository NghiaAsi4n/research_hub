import type { DocumentStore } from '@research-hub/core/document-store';
import { getObjectBytes, markdownKeyFor, putObject } from '@research-hub/core/storage';
import { markdownFromPdfPages } from './pdf-markdown';
import { extractPdfText, type PdfTextResult } from './pdf-text';

// Ghép ba bước của fetcher PDF (Giai đoạn 1, T5): đọc file gốc → trích lớp văn bản → ghi bản Markdown
// sạch cạnh file gốc rồi cập nhật `documents`.
//
// Nhịp và cách đánh dấu trạng thái giống fetcher HTML (T4) để hai loại nguồn dùng chung một hợp đồng:
// `ready` khi có bản sạch, `unreadable` khi nguồn không có nội dung đọc được (PDF scan), `failed` khi
// lỗi ở phía hạ tầng hoặc file hỏng.
//
// Mọi thứ chạm ra ngoài (Object Storage, pdf.js) đều là tham số có mặc định để test chạy bằng đồ giả.

export type PdfIngestOutcome =
  | {
      kind: 'ready';
      title: string;
      markdownKey: string;
      bytes: number;
      pages: number;
      readMs: number;
    }
  | { kind: 'unreadable'; reason: string; readMs: number }
  | { kind: 'failed'; reason: string; detail: string; readMs: number };

export type PdfIngestInput = {
  documentId: string;
  storageKey: string;
  documents: DocumentStore;
  // Tên file lúc ingest: dùng khi PDF không có tiêu đề trong metadata.
  titleHint?: string;
  readObject?: (key: string) => Promise<Uint8Array>;
  writeObject?: (key: string, body: string, contentType: string) => Promise<void>;
  extractText?: (bytes: Uint8Array) => Promise<PdfTextResult>;
  now?: () => number;
};

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export async function ingestPdfDocument(input: PdfIngestInput): Promise<PdfIngestOutcome> {
  const now = input.now ?? (() => Date.now());
  const readObject = input.readObject ?? ((key: string) => getObjectBytes(key));
  const writeObject =
    input.writeObject ??
    ((key, body, contentType) => putObject(key, body, contentType).then(() => undefined));
  const extractText = input.extractText ?? extractPdfText;
  const startedAt = now();

  let bytes: Uint8Array;
  try {
    bytes = await readObject(input.storageKey);
  } catch (error) {
    const readMs = now() - startedAt;
    const detail = error instanceof Error ? error.message : String(error);
    await input.documents.markFailed({
      id: input.documentId,
      reason: 'storage_read',
      meta: { readMs, storageKey: input.storageKey, detail },
    });
    return { kind: 'failed', reason: 'storage_read', detail, readMs };
  }

  const extracted = await extractText(bytes);
  if (extracted.kind === 'error') {
    const readMs = now() - startedAt;
    await input.documents.markFailed({
      id: input.documentId,
      reason: extracted.reason,
      meta: { readMs, storageKey: input.storageKey, detail: extracted.detail },
    });
    return { kind: 'failed', reason: extracted.reason, detail: extracted.detail, readMs };
  }

  if (extracted.kind === 'unreadable') {
    const readMs = now() - startedAt;
    await input.documents.markUnreadable({
      id: input.documentId,
      reason: extracted.reason,
      meta: {
        readMs,
        storageKey: input.storageKey,
        pageCount: extracted.pageCount,
        textLength: extracted.textLength,
      },
    });
    return { kind: 'unreadable', reason: extracted.reason, readMs };
  }

  const markdown = markdownFromPdfPages(extracted.pages);
  if (markdown === '') {
    const readMs = now() - startedAt;
    await input.documents.markUnreadable({
      id: input.documentId,
      reason: 'empty_markdown',
      meta: { readMs, storageKey: input.storageKey, pageCount: extracted.pageCount },
    });
    return { kind: 'unreadable', reason: 'empty_markdown', readMs };
  }

  const markdownKey = markdownKeyFor(input.storageKey);
  const bytesWritten = byteLength(markdown);
  await writeObject(markdownKey, markdown, 'text/markdown; charset=utf-8');

  const readMs = now() - startedAt;
  const title = extracted.title ?? input.titleHint;
  await input.documents.markReady({
    id: input.documentId,
    title: title === undefined || title.trim() === '' ? undefined : title.trim(),
    bytes: bytesWritten,
    pages: extracted.pageCount,
    meta: {
      readMs,
      storageKey: input.storageKey,
      pageCount: extracted.pageCount,
      textLength: extracted.textLength,
      sourceType: 'pdf',
    },
  });

  return {
    kind: 'ready',
    title: title ?? '',
    markdownKey,
    bytes: bytesWritten,
    pages: extracted.pageCount,
    readMs,
  };
}
