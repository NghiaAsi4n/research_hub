'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

type Entry = {
  id: string;
  query: string | null;
  sources: string[];
  cadence: string;
  lastSeenAt: string | null;
};

type Change = {
  id: string;
  watchlistId: string;
  query: string | null;
  diff: {
    url?: string;
    title?: string;
    added?: string[];
    removed?: string[];
    addedCount?: number;
    removedCount?: number;
  } | null;
  createdAt: string;
};

type NotificationRow = {
  id: string;
  kind: string;
  channel: string;
  payload: { title?: string; url?: string; addedCount?: number; removedCount?: number } | null;
  readAt: string | null;
  sentAt: string;
};

type Payload = { entries: Entry[]; changes: Change[]; notifications: NotificationRow[] };

export function Watchlist() {
  const [data, setData] = useState<Payload>({ entries: [], changes: [], notifications: [] });
  const [query, setQuery] = useState('');
  const [urls, setUrls] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/watchlist');
    if (!response.ok) {
      setStatus('Không tải được watchlist.');
      return;
    }
    setData((await response.json()) as Payload);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      const sources = urls
        .split(/[\n,]/u)
        .map((value) => value.trim())
        .filter((value) => value !== '');
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, sources }),
      });
      if (!response.ok) throw new Error();
      setQuery('');
      setUrls('');
      await load();
      setStatus('Đã thêm mục theo dõi. Lượt quét đầu tiên sẽ lưu mốc nội dung.');
    } catch {
      setStatus('Không thêm được: cần ít nhất một URL http(s) hợp lệ.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Xoá mục theo dõi này?')) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/watchlist/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      setStatus('Không xoá được mục theo dõi.');
    } finally {
      setBusy(false);
    }
  };

  const markRead = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      setStatus('Không đánh dấu đã đọc.');
    }
  };

  const unread = data.notifications.filter((item) => item.readAt === null).length;

  return (
    <main>
      <p>
        <a href="/">← Research Hub</a>
      </p>
      <h1>Theo dõi thay đổi</h1>
      <p>
        Cron hằng ngày tải lại từng nguồn, so nội dung với lần trước và báo qua chuông trong app (và
        Telegram nếu đã cấu hình).
      </p>

      <form className="watchlist-form" onSubmit={add}>
        <label htmlFor="watch-query">Tên gợi nhớ</label>
        <input
          id="watch-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={200}
          placeholder="Ví dụ: Luật doanh nghiệp"
        />
        <label htmlFor="watch-urls">URL nguồn, mỗi dòng một địa chỉ</label>
        <textarea
          id="watch-urls"
          value={urls}
          onChange={(event) => setUrls(event.target.value)}
          rows={4}
          placeholder="https://vbpl.vn/..."
        />
        <button type="submit" disabled={busy || urls.trim() === ''}>
          Thêm
        </button>
      </form>

      {status ? <p role="status">{status}</p> : null}

      <section aria-label="Mục đang theo dõi">
        <h2>Đang theo dõi ({data.entries.length})</h2>
        <ul>
          {data.entries.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.query ?? 'Không tên'}</strong>{' '}
              <small>
                lần quét gần nhất:{' '}
                {entry.lastSeenAt ? new Date(entry.lastSeenAt).toLocaleString('vi-VN') : 'chưa'}
              </small>
              <ul>
                {entry.sources.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => remove(entry.id)} disabled={busy}>
                Xoá
              </button>
            </li>
          ))}
          {data.entries.length === 0 ? <li>Chưa có mục nào.</li> : null}
        </ul>
      </section>

      <section aria-label="Thay đổi gần đây">
        <h2>Thay đổi gần đây</h2>
        <ul>
          {data.changes.map((change) => (
            <li key={change.id}>
              <p>
                <strong>{change.diff?.title ?? change.diff?.url ?? 'Nguồn'}</strong>{' '}
                <small>{new Date(change.createdAt).toLocaleString('vi-VN')}</small>
              </p>
              <p>
                +{change.diff?.addedCount ?? 0} / -{change.diff?.removedCount ?? 0} dòng
              </p>
              {change.diff?.added && change.diff.added.length > 0 ? (
                <ul>
                  {change.diff.added.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
          {data.changes.length === 0 ? <li>Chưa phát hiện thay đổi.</li> : null}
        </ul>
      </section>

      <section aria-label="Thông báo">
        <h2>Chuông ({unread} chưa đọc)</h2>
        <ul>
          {data.notifications.map((item) => (
            <li key={item.id}>
              <span>
                [{item.channel}] {item.payload?.title ?? 'Watchlist'} — +
                {item.payload?.addedCount ?? 0}/-{item.payload?.removedCount ?? 0} dòng
              </span>{' '}
              <small>{new Date(item.sentAt).toLocaleString('vi-VN')}</small>{' '}
              {item.readAt === null ? (
                <button type="button" onClick={() => markRead(item.id)}>
                  Đánh dấu đã đọc
                </button>
              ) : null}
            </li>
          ))}
          {data.notifications.length === 0 ? <li>Chưa có thông báo.</li> : null}
        </ul>
      </section>
    </main>
  );
}
