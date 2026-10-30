import { describe, expect, it } from 'vitest';
import {
  buildChatMessages,
  CHAT_MODEL,
  hasSupportedCitation,
  MAX_CONTEXT_CHUNKS,
  parseCitations,
  REFUSAL_TEXT,
} from './chat';
import type { SearchHit } from './search';

function hit(chunkId: string, ord: number): SearchHit {
  return {
    chunkId,
    documentId: `doc-${chunkId}`,
    documentTitle: `Tài liệu ${chunkId}`,
    ord,
    text: `Nội dung đoạn ${chunkId}`,
    ftsRank: 1,
    vectorRank: 1,
    vectorScore: 0.9,
    rrf: 0.03,
  };
}

describe('buildChatMessages', () => {
  it('numbers the retrieved chunks and keeps the question last', () => {
    const messages = buildChatMessages('Thời hạn thuê là bao lâu?', [hit('a', 0), hit('b', 1)]);

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    const user = messages[1]?.content ?? '';
    expect(user).toContain('[1] Tài liệu a — đoạn 1');
    expect(user).toContain('[2] Tài liệu b — đoạn 2');
    expect(user.trimEnd().endsWith('Câu hỏi: Thời hạn thuê là bao lâu?')).toBe(true);
  });

  it('caps the context at the configured number of chunks', () => {
    const hits = Array.from({ length: MAX_CONTEXT_CHUNKS + 3 }, (_, index) =>
      hit(`c${index}`, index),
    );
    const user = buildChatMessages('hỏi', hits)[1]?.content ?? '';

    expect(user).toContain(`[${MAX_CONTEXT_CHUNKS}]`);
    expect(user).not.toContain(`[${MAX_CONTEXT_CHUNKS + 1}]`);
  });

  it('tells the model to refuse when evidence is missing', () => {
    const system = buildChatMessages('hỏi', [hit('a', 0)])[0]?.content ?? '';
    expect(system).toContain(REFUSAL_TEXT);
    expect(system).toContain('[n]');
  });
});

describe('parseCitations', () => {
  it('maps markers to the retrieved chunks and keeps the first occurrence', () => {
    const hits = [hit('a', 0), hit('b', 1)];
    const citations = parseCitations(
      'Thời hạn là 12 tháng [1]. Gia hạn [2] và nhắc lại [1].',
      hits,
    );

    expect(citations.map((citation) => citation.chunkId)).toEqual(['a', 'b']);
    expect(citations[0]).toMatchObject({ index: 1, documentId: 'doc-a', ord: 0 });
  });

  it('ignores markers that point outside the retrieved list', () => {
    const citations = parseCitations('Theo [7] và [0].', [hit('a', 0)]);

    expect(citations).toEqual([]);
    expect(hasSupportedCitation('Theo [7].', [hit('a', 0)])).toBe(false);
  });

  it('truncates a long quote for display', () => {
    const long = { ...hit('a', 0), text: 'x'.repeat(500) };
    const [citation] = parseCitations('xem [1]', [long]);

    expect(citation?.quote.endsWith('…')).toBe(true);
    expect(citation?.quote.length).toBeLessThanOrEqual(241);
  });
});

describe('chat model', () => {
  it('pins the model used by the route', () => {
    expect(CHAT_MODEL).toBe('gemma4:31b');
  });
});
