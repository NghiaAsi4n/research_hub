'use client';

import type { ReaderDocument } from '@research-hub/core/reader';
import { useEffect, useState } from 'react';
import { DocumentReader } from './document-reader';

export function ReaderLoader({ id }: { id: string }) {
  const [loaded, setLoaded] = useState<{ document: ReaderDocument; markdown: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/documents/${id}`, { signal: controller.signal });
        if (!response.ok)
          throw new Error(
            response.status === 401 ? 'Phiên đăng nhập đã hết hạn.' : 'Không mở được tài liệu.',
          );
        const document = (await response.json()) as ReaderDocument;
        if (document.status !== 'ready')
          throw new Error(
            document.status === 'pending'
              ? 'Tài liệu đang được xử lý. Hãy mở lại sau.'
              : 'Nguồn này chưa có bản đọc được.',
          );
        const content = await fetch(`/api/documents/${document.id}?format=markdown`, {
          signal: controller.signal,
        });
        if (!content.ok) throw new Error('Không tải được nội dung tài liệu.');
        setLoaded({ document, markdown: await content.text() });
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Không mở được tài liệu.');
      }
    }
    void load();
    return () => controller.abort();
  }, [id]);
  if (error)
    return (
      <div role="alert">
        <h1>Chưa thể đọc tài liệu</h1>
        <p>{error}</p>
        <a href="/library">Về kho tài liệu</a>
      </div>
    );
  if (!loaded)
    return (
      <p role="status" aria-busy="true">
        Đang tải tài liệu…
      </p>
    );
  return <DocumentReader key={loaded.document.id} {...loaded} />;
}
