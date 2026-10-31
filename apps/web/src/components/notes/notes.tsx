'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type NoteSummary = {
  id: string;
  title: string;
  tags: string[];
  docId: string | null;
  updatedAt: string;
};

type NoteRef = { id: string; title: string };

type StoredNote = NoteSummary & {
  bodyMd: string;
  createdAt: string;
  outgoing: NoteRef[];
  backlinks: NoteRef[];
};

export function Notes() {
  const [list, setList] = useState<NoteSummary[]>([]);
  const [selected, setSelected] = useState<StoredNote | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tagFilter, setTagFilter] = useState<string | undefined>();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const open = useCallback(async (id: string) => {
    setStatus('');
    const response = await fetch(`/api/notes/${id}`);
    if (!response.ok) {
      setStatus('Không mở được ghi chú.');
      return;
    }
    const note = (await response.json()) as StoredNote;
    setSelected(note);
    setTitle(note.title);
    setBody(note.bodyMd);
  }, []);

  const loadList = useCallback(async (tag?: string) => {
    const query = tag === undefined ? '' : `?tag=${encodeURIComponent(tag)}`;
    const response = await fetch(`/api/notes${query}`);
    if (!response.ok) {
      setStatus('Không tải được danh sách ghi chú.');
      return;
    }
    setList((await response.json()) as NoteSummary[]);
  }, []);

  useEffect(() => {
    void loadList(tagFilter);
  }, [loadList, tagFilter]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('note');
    if (id) void open(id);
  }, [open]);

  const create = async () => {
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Ghi chú mới', bodyMd: '' }),
      });
      if (!response.ok) throw new Error();
      const note = (await response.json()) as StoredNote;
      await loadList(tagFilter);
      await open(note.id);
    } catch {
      setStatus('Không tạo được ghi chú.');
    } finally {
      setBusy(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch(`/api/notes/${selected.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, bodyMd: body }),
      });
      if (!response.ok) throw new Error();
      const note = (await response.json()) as StoredNote;
      setSelected(note);
      setTitle(note.title);
      setBody(note.bodyMd);
      await loadList(tagFilter);
      setStatus('Đã lưu.');
    } catch {
      setStatus('Không lưu được ghi chú.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (!window.confirm(`Xoá ghi chú "${selected.title}"?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/notes/${selected.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error();
      setSelected(null);
      setTitle('');
      setBody('');
      await loadList(tagFilter);
      setStatus('Đã xoá.');
    } catch {
      setStatus('Không xoá được ghi chú.');
    } finally {
      setBusy(false);
    }
  };

  const tags = [...new Set(list.flatMap((note) => note.tags))].sort();

  return (
    <main>
      <p>
        <a href="/">← Research Hub</a>
      </p>
      <h1>Ghi chú</h1>
      <p>
        Liên kết ghi chú bằng <code>[[Tiêu đề]]</code>, gắn tag bằng <code>#tag</code>.
      </p>

      <div className="notes-toolbar">
        <button type="button" onClick={create} disabled={busy}>
          Ghi chú mới
        </button>
        {tags.length > 0 ? (
          <span>
            Lọc:{' '}
            <button
              type="button"
              className={tagFilter === undefined ? 'is-active' : undefined}
              onClick={() => setTagFilter(undefined)}
            >
              tất cả
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={tagFilter === tag ? 'is-active' : undefined}
                onClick={() => setTagFilter(tag)}
              >
                #{tag}
              </button>
            ))}
          </span>
        ) : null}
      </div>

      {status ? <p role="status">{status}</p> : null}

      <div className="notes-layout">
        <nav aria-label="Danh sách ghi chú">
          <ul>
            {list.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  className={selected?.id === note.id ? 'is-active' : undefined}
                  onClick={() => open(note.id)}
                >
                  {note.title}
                </button>
                {note.tags.length > 0 ? <small> #{note.tags.join(' #')}</small> : null}
              </li>
            ))}
            {list.length === 0 ? <li>Chưa có ghi chú.</li> : null}
          </ul>
        </nav>

        <section aria-label="Soạn ghi chú">
          {selected ? (
            <form onSubmit={save}>
              <label htmlFor="note-title">Tiêu đề</label>
              <input
                id="note-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                required
              />
              <label htmlFor="note-body">Nội dung Markdown</label>
              <textarea
                id="note-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={14}
              />
              <div className="notes-actions">
                <button type="submit" disabled={busy}>
                  Lưu
                </button>
                <button type="button" onClick={remove} disabled={busy}>
                  Xoá
                </button>
              </div>
            </form>
          ) : (
            <p>Chọn một ghi chú hoặc tạo mới.</p>
          )}
        </section>
      </div>

      {selected ? (
        <>
          <section aria-label="Xem trước">
            <h2>Xem trước</h2>
            <div className="notes-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
            </div>
          </section>

          <section aria-label="Liên kết">
            <h2>Liên kết</h2>
            <p>
              Trỏ tới:{' '}
              {selected.outgoing.length === 0
                ? 'chưa có'
                : selected.outgoing.map((ref) => (
                    <a key={ref.id} href={`/notes?note=${ref.id}`}>
                      {ref.title}{' '}
                    </a>
                  ))}
            </p>
            <p>
              Được nhắc ở:{' '}
              {selected.backlinks.length === 0
                ? 'chưa có'
                : selected.backlinks.map((ref) => (
                    <a key={ref.id} href={`/notes?note=${ref.id}`}>
                      {ref.title}{' '}
                    </a>
                  ))}
            </p>
          </section>
        </>
      ) : null}
    </main>
  );
}
