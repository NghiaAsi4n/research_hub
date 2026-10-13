import type { DocumentStore } from '@research-hub/core/document-store';
import { markdownKeyFor, putObject } from '@research-hub/core/storage';
import { fetchHtml } from './fetch-html';
import { articleFromHtml } from './html-article';

// Ghép ba bước của fetcher HTML (Giai đoạn 1, T4): tải → trích → ghi bản sạch + cập nhật `documents`.
//
// Mọi thứ chạm ra ngoài (`fetch`, Object Storage, DB) đều là tham số có mặc định, để test chạy được
// bằng đồ giả và để T7 thay được phần đọc file bằng luồng.

// Trần thời gian của một lượt ingest (plan mục 8). Thời gian thực tế ghi vào `meta.readMs`.
export const INGEST_BUDGET_MS = 300_000;

export type HtmlIngestOutcome =
  | { kind: 'ready'; title: string; markdownKey: string; bytes: number; readMs: number }
  | { kind: 'unreadable'; reason: string; readMs: number }
  | { kind: 'failed'; reason: string; detail: string; readMs: number };

export type HtmlIngestInput = {
  documentId: string;
  url: string;
  storageKey: string;
  documents: DocumentStore;
  fetchImpl?: typeof fetch;
  writeObject?: (key: string, body: string, contentType: string) => Promise<void>;
  now?: () => number;
};

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export async function ingestHtmlDocument(input: HtmlIngestInput): Promise<HtmlIngestOutcome> {
  const now = input.now ?? (() => Date.now());
  const writeObject =
    input.writeObject ??
    ((key, body, contentType) => putObject(key, body, contentType).then(() => undefined));
  const startedAt = now();

  const fetched =
    input.fetchImpl === undefined
      ? await fetchHtml(input.url)
      : await fetchHtml(input.url, { fetchImpl: input.fetchImpl });

  if (fetched.kind === 'error') {
    const readMs = now() - startedAt;
    await input.documents.markFailed({
      id: input.documentId,
      reason: fetched.reason,
      meta: { readMs, sourceUrl: input.url, detail: fetched.detail },
    });
    return { kind: 'failed', reason: fetched.reason, detail: fetched.detail, readMs };
  }

  const article = articleFromHtml(fetched.html, { url: input.url });
  if (article.kind === 'unreadable') {
    const readMs = now() - startedAt;
    await input.documents.markUnreadable({
      id: input.documentId,
      reason: article.reason,
      meta: { readMs, sourceUrl: input.url },
    });
    return { kind: 'unreadable', reason: article.reason, readMs };
  }

  const markdownKey = markdownKeyFor(input.storageKey);
  await writeObject(markdownKey, article.markdown, 'text/markdown; charset=utf-8');

  const readMs = now() - startedAt;
  await input.documents.markReady({
    id: input.documentId,
    title: article.title === '' ? undefined : article.title,
    bytes: byteLength(article.markdown),
    meta: { readMs, sourceUrl: input.url, textLength: article.textLength },
  });

  return {
    kind: 'ready',
    title: article.title,
    markdownKey,
    bytes: byteLength(article.markdown),
    readMs,
  };
}
