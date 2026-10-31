'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

type Hit = {
  kind: 'document' | 'note' | 'chunk';
  id: string;
  title: string;
  snippet: string;
  href: string;
};

const LABELS: Record<Hit['kind'], string> = {
  document: 'Tài liệu',
  note: 'Ghi chú',
  chunk: 'Đoạn văn',
};

export function Search() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [status, setStatus] = useState('');
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (value: string) => {
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as { hits: Hit[] };
      setHits(payload.hits);
      setSearched(true);
    } catch {
      setStatus('Không tìm được. Hãy thử lại.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q');
    if (initial) {
      setQuery(initial);
      void run(initial);
    }
  }, [run]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (value === '' || busy) return;
    window.history.replaceState(null, '', `/search?q=${encodeURIComponent(value)}`);
    await run(value);
  };

  return (
    <main>
      <p>
        <a href="/">← Research Hub</a>
      </p>
      <h1>Tìm kiếm toàn cục</h1>
      <form onSubmit={submit}>
        <label htmlFor="global-query">Từ khoá</label>
        <input
          id="global-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={200}
          placeholder="Ví dụ: doanh nghiệp tư nhân"
        />
        <button type="submit" disabled={busy || query.trim() === ''}>
          {busy ? 'Đang tìm…' : 'Tìm'}
        </button>
      </form>

      {status ? <p role="alert">{status}</p> : null}

      {searched ? (
        <section aria-label="Kết quả">
          <h2>{hits.length} kết quả</h2>
          {hits.length === 0 ? <p>Không có kết quả cho từ khoá này.</p> : null}
          <ul>
            {hits.map((hit) => (
              <li key={`${hit.kind}-${hit.id}`}>
                <p>
                  <small>{LABELS[hit.kind]}</small> <a href={hit.href}>{hit.title}</a>
                </p>
                <p>{hit.snippet}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
