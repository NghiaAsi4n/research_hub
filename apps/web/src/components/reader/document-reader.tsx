'use client';

import type { HighlightInput, ReaderDocument, SavedHighlight } from '@research-hub/core/reader';
import { useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { readerMarkup } from './markdown';
import { useReadingPosition } from './use-reading-position';

export function DocumentReader({
  document: doc,
  markdown,
}: {
  document: ReaderDocument;
  markdown: string;
}) {
  const content = useRef<HTMLElement>(null);
  const [highlights, setHighlights] = useState<SavedHighlight[]>(doc.highlights);
  const [selection, setSelection] = useState<HighlightInput | null>(null);
  const [toc, setToc] = useState<{ id: string; label: string; level: string }[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const positionError = useReadingPosition(doc.id, doc.progress);
  const plugins = useMemo(
    () => [
      [readerMarkup, { highlights }] as [typeof readerMarkup, { highlights: SavedHighlight[] }],
    ],
    [highlights],
  );

  useEffect(() => {
    setToc(
      [
        ...(content.current?.querySelectorAll<HTMLElement>(
          'h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]',
        ) ?? []),
      ].map((heading) => ({
        id: heading.id,
        label: heading.textContent ?? '',
        level: heading.tagName,
      })),
    );
    const selected = () => {
      const selectedText = window.getSelection();
      const root = content.current;
      if (!root || !selectedText || selectedText.isCollapsed || !selectedText.rangeCount) {
        setSelection(null);
        return;
      }
      const range = selectedText.getRangeAt(0);
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
        setSelection(null);
        return;
      }
      const before = range.cloneRange();
      before.selectNodeContents(root);
      before.setEnd(range.startContainer, range.startOffset);
      // Range.toString() injects line breaks between block elements; textContent
      // matches the text nodes that the Markdown highlighter indexes.
      const startOffset = (before.cloneContents().textContent ?? '').length;
      const quote = range.cloneContents().textContent ?? '';
      setSelection(
        quote.trim() && quote.length <= 10_000
          ? { startOffset, endOffset: startOffset + quote.length, quote }
          : null,
      );
    };
    document.addEventListener('selectionchange', selected);
    return () => document.removeEventListener('selectionchange', selected);
  }, []);

  async function addHighlight() {
    if (!selection || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/documents/${doc.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(selection),
      });
      if (!response.ok) throw new Error('save_failed');
      const highlight = (await response.json()) as SavedHighlight;
      setHighlights((current) => [...current.filter((h) => h.id !== highlight.id), highlight]);
      window.getSelection()?.removeAllRanges();
      setMessage('Đã lưu highlight.');
    } catch {
      setMessage('Chưa lưu được highlight. Hãy thử lại.');
    } finally {
      setSaving(false);
    }
  }

  async function removeHighlight(id: string) {
    try {
      const response = await fetch(`/api/documents/${doc.id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error('delete_failed');
      setHighlights((current) => current.filter((h) => h.id !== id));
      setMessage('Đã xoá highlight.');
    } catch {
      setMessage('Chưa xoá được highlight. Hãy thử lại.');
    }
  }

  return (
    <div className="reader-layout">
      <aside className="reader-sidebar">
        <nav aria-label="Mục lục">
          <h2>Mục lục</h2>
          {toc.length ? (
            <ul>
              {toc.map((entry) => (
                <li key={entry.id} data-level={entry.level}>
                  <a href={`#${entry.id}`}>{entry.label}</a>
                </li>
              ))}
            </ul>
          ) : (
            <p>Tài liệu chưa có tiêu đề mục.</p>
          )}
        </nav>
        <details>
          <summary>Nguồn ({doc.sources.length})</summary>
          <ul>
            {doc.sources.map((source) => (
              <li key={source.id}>
                {source.url && /^https?:\/\//.test(source.url) ? (
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.url}
                  </a>
                ) : (
                  (source.url ?? 'File đã tải lên')
                )}
              </li>
            ))}
          </ul>
        </details>
      </aside>
      <div>
        <header>
          <a href="/library">← Kho tài liệu</a>
          <h1>{doc.title}</h1>
          {doc.pages && <p>{doc.pages} trang</p>}
        </header>
        <div className="reader-toolbar">
          <button
            type="button"
            disabled={!selection || saving}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void addHighlight()}
          >
            {saving ? 'Đang lưu…' : 'Highlight đoạn đã chọn'}
          </button>
          <span role="status">
            {positionError ? 'Chưa lưu được vị trí đọc. Cuộn lại để thử lưu.' : message}
          </span>
        </div>
        <article ref={content} className="reader-content" aria-label="Nội dung tài liệu">
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={plugins}
            skipHtml
            components={{
              img: ({ alt }) => (
                <span className="reader-image-note">
                  {alt ? `[Ảnh: ${alt}]` : '[Ảnh trong bản gốc]'}
                </span>
              ),
              a: ({ children, href }) => (
                <a href={href} rel="noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {markdown}
          </Markdown>
        </article>
        <section aria-label="Highlight đã lưu" className="reader-highlights">
          <h2>Highlight đã lưu ({highlights.length})</h2>
          {highlights.length === 0 ? (
            <p>Chọn một đoạn trong tài liệu rồi bấm “Highlight đoạn đã chọn”.</p>
          ) : (
            <ul>
              {highlights.map((highlight) => (
                <li key={highlight.id}>
                  <blockquote>{highlight.quote}</blockquote>
                  <button type="button" onClick={() => void removeHighlight(highlight.id)}>
                    Xoá highlight
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
