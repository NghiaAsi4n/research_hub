import { describe, expect, it, vi } from 'vitest';
import { type EvalQuestion, evaluateCitations, scoreAnswer } from './eval-citations';
import type { SearchHit } from './search';

function hit(documentTitle: string, text: string, chunkId = text.slice(0, 8)): SearchHit {
  return {
    chunkId,
    documentId: `doc-${chunkId}`,
    documentTitle,
    ord: 0,
    text,
    ftsRank: 1,
    vectorRank: 1,
    vectorScore: 0.9,
    rrf: 0.03,
  };
}

const question: EvalQuestion = {
  id: 'q1',
  question: 'Thời hạn thuê là bao lâu?',
  documentTitle: 'Hợp đồng thuê nhà',
  contains: 'thời hạn thuê là 12 tháng',
};

describe('scoreAnswer', () => {
  it('counts an answer whose citation points at the expected passage', () => {
    const hits = [
      hit('Hợp đồng thuê nhà', 'Các bên thỏa thuận thời hạn thuê là 12 tháng kể từ ngày bàn giao.'),
    ];
    const outcome = scoreAnswer(question, 'Thời hạn là 12 tháng [1].', hits);

    expect(outcome).toMatchObject({ correct: true, cited: true, matchedIndex: 1 });
  });

  it('rejects a citation that points at another document', () => {
    const hits = [hit('Hợp đồng thuê xe', 'Các bên thỏa thuận thời hạn thuê là 12 tháng.')];
    const outcome = scoreAnswer(question, 'Thời hạn là 12 tháng [1].', hits);

    expect(outcome).toMatchObject({ correct: false, cited: true });
  });

  it('rejects an answer that cites a passage with the wrong content', () => {
    const hits = [hit('Hợp đồng thuê nhà', 'Tiền đặt cọc là hai tháng tiền thuê.')];
    const outcome = scoreAnswer(question, 'Thời hạn là 12 tháng [1].', hits);

    expect(outcome).toMatchObject({ correct: false, cited: true });
  });

  it('marks an answer without any citation as uncited', () => {
    const hits = [hit('Hợp đồng thuê nhà', 'thời hạn thuê là 12 tháng')];
    const outcome = scoreAnswer(question, 'Khoảng một năm.', hits);

    expect(outcome).toMatchObject({ correct: false, cited: false });
  });
});

describe('evaluateCitations', () => {
  it('reports accuracy over the whole set', async () => {
    const ask = vi.fn(async (text: string) =>
      text.includes('Thời hạn')
        ? {
            answer: 'Mười hai tháng [1].',
            hits: [hit('Hợp đồng thuê nhà', 'thời hạn thuê là 12 tháng')],
          }
        : { answer: 'Không rõ.', hits: [hit('Hợp đồng thuê nhà', 'nội dung khác')] },
    );

    const report = await evaluateCitations({
      questions: [
        question,
        { ...question, id: 'q2', question: 'Tiền cọc bao nhiêu?', contains: 'đặt cọc' },
      ],
      ask,
    });

    expect(report.total).toBe(2);
    expect(report.correct).toBe(1);
    expect(report.accuracy).toBeCloseTo(0.5);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('returns zero accuracy for an empty set', async () => {
    const report = await evaluateCitations({ questions: [], ask: vi.fn() });

    expect(report).toMatchObject({ total: 0, correct: 0, accuracy: 0 });
  });
});
