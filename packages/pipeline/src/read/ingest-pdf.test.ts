import { readFileSync } from 'node:fs';
import type { DocumentStore } from '@research-hub/core/document-store';
import { describe, expect, it } from 'vitest';
import { INGEST_BUDGET_MS } from './ingest-html';
import { ingestPdfDocument } from './ingest-pdf';

// Fixture thật (xem `packages/pipeline/scripts/make-pdf-fixtures.py`): hợp đồng ba trang có lớp văn
// bản và một trang chỉ có ảnh.

const contractBytes = () =>
  new Uint8Array(readFileSync(new URL('./__fixtures__/contract-3-pages.pdf', import.meta.url)));
const scanBytes = () =>
  new Uint8Array(readFileSync(new URL('./__fixtures__/scan-1-page.pdf', import.meta.url)));

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

describe('ingestPdfDocument', () => {
  it('ghi bản Markdown cạnh file gốc rồi đánh dấu ready kèm số trang', async () => {
    const store = recordingStore();
    const writes: Array<{ key: string; body: string; contentType: string }> = [];
    let clock = 1_000;

    const outcome = await ingestPdfDocument({
      documentId: 'doc-1',
      storageKey: 'documents/2026/10/abc-hop-dong.pdf',
      documents: store.documents,
      titleHint: 'Hop dong mau.pdf',
      readObject: async () => contractBytes(),
      writeObject: async (key, body, contentType) => {
        writes.push({ key, body, contentType });
      },
      now: () => {
        clock += 700;
        return clock;
      },
    });

    expect(outcome).toMatchObject({
      kind: 'ready',
      markdownKey: 'documents/2026/10/abc-hop-dong.pdf.md',
      pages: 3,
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.key).toBe('documents/2026/10/abc-hop-dong.pdf.md');
    expect(writes[0]?.contentType).toBe('text/markdown; charset=utf-8');
    expect(writes[0]?.body).toContain('<!-- page: 1 -->');
    expect(writes[0]?.body).toContain('### 1. Doi tuong cua hop dong');

    expect(store.ready).toHaveLength(1);
    expect(store.unreadable).toHaveLength(0);
    expect(store.ready[0]).toMatchObject({ id: 'doc-1', pages: 3, title: 'Hop dong mau.pdf' });
    expect(store.ready[0]?.bytes).toBeGreaterThan(0);
    const meta = store.ready[0]?.meta as { readMs: number; sourceType: string; pageCount: number };
    expect(meta.pageCount).toBe(3);
    expect(meta.sourceType).toBe('pdf');
    expect(meta.readMs).toBeGreaterThanOrEqual(0);
    expect(meta.readMs).toBeLessThan(INGEST_BUDGET_MS);
  });

  it('bản scan bị đánh dấu unreadable và không ghi Markdown', async () => {
    const store = recordingStore();
    const writes: string[] = [];

    const outcome = await ingestPdfDocument({
      documentId: 'doc-2',
      storageKey: 'documents/2026/10/abc-scan.pdf',
      documents: store.documents,
      readObject: async () => scanBytes(),
      writeObject: async (key) => {
        writes.push(key);
      },
    });

    expect(outcome).toMatchObject({ kind: 'unreadable', reason: 'no_text_layer' });
    expect(writes).toHaveLength(0);
    expect(store.unreadable).toHaveLength(1);
    expect(store.unreadable[0]).toMatchObject({ id: 'doc-2', reason: 'no_text_layer' });
    expect(store.ready).toHaveLength(0);
  });

  it('file hỏng bị đánh dấu failed, không ghi gì', async () => {
    const store = recordingStore();
    let wrote = false;

    const outcome = await ingestPdfDocument({
      documentId: 'doc-3',
      storageKey: 'documents/2026/10/abc-hong.pdf',
      documents: store.documents,
      readObject: async () => new TextEncoder().encode('khong phai pdf'),
      writeObject: async () => {
        wrote = true;
      },
    });

    expect(outcome).toMatchObject({ kind: 'failed', reason: 'invalid_pdf' });
    expect(wrote).toBe(false);
    expect(store.failed).toHaveLength(1);
    expect(store.failed[0]).toMatchObject({ id: 'doc-3', reason: 'invalid_pdf' });
  });

  it('lỗi đọc Object Storage bị đánh dấu failed kèm lý do riêng', async () => {
    const store = recordingStore();

    const outcome = await ingestPdfDocument({
      documentId: 'doc-4',
      storageKey: 'documents/2026/10/abc-thieu.pdf',
      documents: store.documents,
      readObject: async () => {
        throw new Error('NoSuchKey');
      },
    });

    expect(outcome).toMatchObject({ kind: 'failed', reason: 'storage_read', detail: 'NoSuchKey' });
    expect(store.failed).toHaveLength(1);
    expect(store.failed[0]).toMatchObject({ id: 'doc-4', reason: 'storage_read' });
    expect(store.unreadable).toHaveLength(0);
  });

  it('lấy tiêu đề trong metadata PDF khi có, thay cho tên file', async () => {
    const store = recordingStore();

    await ingestPdfDocument({
      documentId: 'doc-5',
      storageKey: 'documents/2026/10/abc.pdf',
      documents: store.documents,
      titleHint: 'ten-file.pdf',
      readObject: async () => contractBytes(),
      writeObject: async () => undefined,
      extractText: async () => ({
        kind: 'ok',
        title: 'Hop dong nguyen ban',
        pageCount: 1,
        pages: [{ pageNumber: 1, lines: [{ text: 'Noi dung', fontSize: 11, y: 700 }] }],
        textLength: 120,
      }),
    });

    expect(store.ready[0]).toMatchObject({ title: 'Hop dong nguyen ban' });
  });
});
