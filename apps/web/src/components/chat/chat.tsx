'use client';

import type { Citation } from '@research-hub/core/chat';
import { type FormEvent, useState } from 'react';

// Giao diện hỏi đáp có trích dẫn (Giai đoạn 2, T4).
//
// Đọc SSE từ `/api/chat`: `token` nối dần vào câu trả lời, `replace` thay bằng câu từ chối khi mô
// hình không dẫn được đoạn nào, `citations` mở danh sách nguồn bấm được.

type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'replace'; text: string }
  | { type: 'citations'; citations: Citation[] }
  | { type: 'done' }
  | { type: 'error'; message: string };

type Quote = { title: string; text: string; ord: number };

export function Chat() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (trimmed === '' || pending) return;

    setPending(true);
    setAnswer('');
    setCitations([]);
    setQuote(null);
    setError('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as {
          error?: string;
          retryAfterSeconds?: number;
        } | null;
        throw new Error(
          detail?.error === 'rate_limited'
            ? `Bị giới hạn tần suất, thử lại sau ${detail.retryAfterSeconds ?? 60} giây.`
            : 'Không gửi được câu hỏi. Hãy thử lại.',
        );
      }
      if (!response.body) throw new Error('Máy chủ không trả về luồng câu trả lời.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const raw = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');
          if (!raw.startsWith('data:')) continue;

          const payload = JSON.parse(raw.slice(5).trim()) as StreamEvent;
          if (payload.type === 'token') setAnswer((current) => current + payload.text);
          if (payload.type === 'replace') setAnswer(payload.text);
          if (payload.type === 'citations') setCitations(payload.citations);
          if (payload.type === 'error') setError(payload.message);
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không gửi được câu hỏi.');
    } finally {
      setPending(false);
    }
  };

  const openCitation = async (citation: Citation) => {
    try {
      const response = await fetch(`/api/chunks/${citation.chunkId}`);
      if (!response.ok) throw new Error('Không mở được đoạn nguồn.');
      const chunk = (await response.json()) as {
        documentTitle: string;
        ord: number;
        text: string;
      };
      setQuote({ title: chunk.documentTitle, text: chunk.text, ord: chunk.ord });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không mở được đoạn nguồn.');
    }
  };

  return (
    <main>
      <p>
        <a href="/">← Research Hub</a>
      </p>
      <h1>Hỏi đáp có trích dẫn</h1>

      <form onSubmit={submit}>
        <label htmlFor="question">Câu hỏi</label>
        <textarea
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Ví dụ: hợp đồng chấm dứt trong trường hợp nào?"
        />
        <button type="submit" disabled={pending || question.trim() === ''}>
          {pending ? 'Đang hỏi…' : 'Hỏi'}
        </button>
      </form>

      {pending && answer === '' ? <p role="status">Đang chờ model trả lời…</p> : null}
      {error ? <p role="alert">{error}</p> : null}

      {answer ? (
        <section aria-label="Câu trả lời">
          <p>{answer}</p>
          {citations.length > 0 ? (
            <ol>
              {citations.map((citation) => (
                <li key={citation.chunkId}>
                  <button type="button" onClick={() => openCitation(citation)}>
                    [{citation.index}] {citation.documentTitle} — đoạn {citation.ord + 1}
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p>Không có trích dẫn hợp lệ cho câu trả lời này.</p>
          )}
        </section>
      ) : null}

      {quote ? (
        <aside aria-label="Đoạn nguồn">
          <h2>{quote.title}</h2>
          <p>Đoạn {quote.ord + 1}</p>
          <blockquote>{quote.text}</blockquote>
        </aside>
      ) : null}
    </main>
  );
}
