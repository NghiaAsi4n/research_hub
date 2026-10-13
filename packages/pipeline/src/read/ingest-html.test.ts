import type { DocumentStore } from '@research-hub/core/document-store';
import { describe, expect, it } from 'vitest';
import { USER_AGENT } from './fetch-html';
import { INGEST_BUDGET_MS, ingestHtmlDocument } from './ingest-html';

const article = `<!doctype html>
<html lang="vi"><head><title>Nghị định mới</title></head>
<body><article><h1>Nghị định mới</h1>
<p>Nội dung chính của nghị định nói về trình tự thủ tục và trách nhiệm của các bên liên quan trong
quá trình xử lý hồ sơ, kèm thời hạn cụ thể cho từng bước và chế tài khi chậm trễ quá hạn quy định.
Đoạn này cố tình dài để vượt ngưỡng tối thiểu của Readability và được coi là bài viết thật.</p>
</article></body></html>`;

const javascriptPage = `<!doctype html>
<html lang="vi"><head><title>Ứng dụng</title></head><body><div id="root"></div></body></html>`;

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
}

function recordingStore() {
  const ready: Array<Record<string, unknown>> = [];
  const unreadable: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];

  const documents: DocumentStore = {
    async markReady(input) {
      ready.push({ ...input });
    },
    async markUnreadable(input) {
      unreadable.push({ ...input });
    },
    async markFailed(input) {
      failed.push({ ...input });
    },
  };

  return { documents, ready, unreadable, failed };
}

describe('ingestHtmlDocument', () => {
  it('ghi bản sạch cạnh file gốc rồi đánh dấu tài liệu là ready', async () => {
    const store = recordingStore();
    const writes: Array<{ key: string; body: string; contentType: string }> = [];
    const sentHeaders: unknown[] = [];
    let clock = 1_000;

    const outcome = await ingestHtmlDocument({
      documentId: 'doc-1',
      url: 'https://example.com/nghi-dinh',
      storageKey: 'documents/2026/10/abc-bai-viet',
      documents: store.documents,
      fetchImpl: async (_url, init) => {
        sentHeaders.push(init?.headers ?? null);
        return htmlResponse(article);
      },
      writeObject: async (key, body, contentType) => {
        writes.push({ key, body, contentType });
      },
      now: () => {
        clock += 500;
        return clock;
      },
    });

    expect(outcome.kind).toBe('ready');
    expect(sentHeaders[0]).toMatchObject({ 'user-agent': USER_AGENT });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.key).toBe('documents/2026/10/abc-bai-viet.md');
    expect(writes[0]?.contentType).toBe('text/markdown; charset=utf-8');
    // Thẻ h1 trùng tiêu đề bị Readability gộp vào `title`, nên bản Markdown bắt đầu bằng đoạn thân.
    expect(writes[0]?.body).toContain('Nội dung chính của nghị định');

    expect(store.ready).toHaveLength(1);
    expect(store.unreadable).toHaveLength(0);
    expect(store.ready[0]).toMatchObject({ id: 'doc-1', title: 'Nghị định mới' });
    expect(store.ready[0]?.bytes).toBeGreaterThan(0);
    const meta = store.ready[0]?.meta as { readMs: number };
    expect(meta.readMs).toBeGreaterThanOrEqual(0);
    expect(meta.readMs).toBeLessThan(INGEST_BUDGET_MS);
  });

  it('đánh dấu unreadable và không ghi Markdown khi trang chỉ có JavaScript', async () => {
    const store = recordingStore();
    const writes: string[] = [];

    const outcome = await ingestHtmlDocument({
      documentId: 'doc-2',
      url: 'https://example.com/app',
      storageKey: 'documents/2026/10/abc-app',
      documents: store.documents,
      fetchImpl: async () => htmlResponse(javascriptPage),
      writeObject: async (key) => {
        writes.push(key);
      },
    });

    expect(outcome.kind).toBe('unreadable');
    expect(writes).toHaveLength(0);
    expect(store.unreadable).toHaveLength(1);
    expect(store.unreadable[0]).toMatchObject({ id: 'doc-2' });
    expect(store.ready).toHaveLength(0);
  });

  it('đánh dấu failed khi nguồn trả lỗi HTTP, không ghi gì', async () => {
    const store = recordingStore();
    let wrote = false;

    const outcome = await ingestHtmlDocument({
      documentId: 'doc-3',
      url: 'https://example.com/hong',
      storageKey: 'documents/2026/10/abc-hong',
      documents: store.documents,
      fetchImpl: async () => new Response('lỗi', { status: 502 }),
      writeObject: async () => {
        wrote = true;
      },
    });

    expect(outcome).toMatchObject({ kind: 'failed', reason: 'http_error' });
    expect(wrote).toBe(false);
    expect(store.failed).toHaveLength(1);
    expect(store.failed[0]).toMatchObject({ id: 'doc-3', reason: 'http_error' });
  });
});
