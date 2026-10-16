'use client';

import type { ReaderDocument } from '@research-hub/core/reader';
import { type FormEvent, useEffect, useState } from 'react';

type Entry = Pick<ReaderDocument, 'id' | 'title' | 'status' | 'pages'>;
const statusLabel: Record<string, string> = {
  ready: 'Sẵn sàng đọc',
  pending: 'Đang xử lý',
  unreadable: 'Không đọc được',
  failed: 'Xử lý thất bại',
};

export function Library() {
  const [documents, setDocuments] = useState<Entry[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState('');
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision triggers an explicit refresh of the current page.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/documents?offset=${offset}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Không tải được kho tài liệu. Hãy thử lại.');
        setDocuments((await response.json()) as Entry[]);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(error instanceof Error ? error.message : 'Không tải được kho tài liệu.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [offset, revision]);

  async function ingest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('Đang đọc nguồn…');
    setLastId('');
    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceUrl: form.get('url') }),
      });
      const result = (await response.json()) as {
        documentId?: string;
        duplicate?: boolean;
        state?: string;
      };
      if (!response.ok)
        throw new Error(
          result.state === 'unreadable'
            ? 'Nguồn không có nội dung đọc được.'
            : 'Chưa nhập được tài liệu. Hãy kiểm tra URL và thử lại.',
        );
      setMessage(
        result.state === 'pending'
          ? 'Tài liệu trùng đang được xử lý. Nguồn đã được ghi nhận; làm mới danh sách sau ít phút.'
          : result.duplicate
            ? 'Tài liệu đã có trong kho. Nguồn đã được ghi nhận.'
            : 'Đã thêm tài liệu vào kho.',
      );
      setLastId(result.state === 'pending' ? '' : (result.documentId ?? ''));
      setOffset(0);
      setRevision((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không nhập được tài liệu.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="library">
      <h1>Kho tài liệu</h1>
      <p>Đọc bản sạch, lưu highlight và tiếp tục từ chỗ đang đọc.</p>
      <form onSubmit={(event) => void ingest(event)}>
        <label htmlFor="source-url">Thêm bài viết từ URL</label>
        <div className="library-input">
          <input
            id="source-url"
            name="url"
            type="url"
            placeholder="https://…"
            required
            disabled={busy}
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Đang đọc…' : 'Thêm tài liệu'}
          </button>
        </div>
      </form>
      <p role="status">
        {message} {lastId && <a href={`/library/${lastId}`}>Mở tài liệu</a>}
      </p>
      <button type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>
        Làm mới danh sách
      </button>
      {loading ? (
        <p role="status">Đang tải kho tài liệu…</p>
      ) : documents.length ? (
        <ul className="library-list">
          {documents.map((document) => (
            <li key={document.id}>
              <a href={`/library/${document.id}`}>{document.title}</a>
              <span>
                {statusLabel[document.status] ?? document.status}
                {document.pages ? ` · ${document.pages} trang` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>Chưa có tài liệu trong trang này.</p>
      )}
      <nav aria-label="Phân trang kho tài liệu">
        <button
          type="button"
          disabled={loading || offset === 0}
          onClick={() => setOffset((value) => Math.max(0, value - 30))}
        >
          Trang trước
        </button>
        <button
          type="button"
          disabled={loading || documents.length < 30}
          onClick={() => setOffset((value) => value + 30)}
        >
          Trang sau
        </button>
      </nav>
    </section>
  );
}
