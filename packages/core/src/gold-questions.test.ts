import { describe, expect, it } from 'vitest';
import { ACCURACY_TARGET, evaluateCitations } from './eval-citations';
import { GOLD_QUESTIONS } from './gold-questions';
import type { SearchHit } from './search';

function hit(documentTitle: string, text: string): SearchHit {
  return {
    chunkId: `${documentTitle}-${text.length}`,
    documentId: documentTitle,
    documentTitle,
    ord: 0,
    text,
    ftsRank: 1,
    vectorRank: 1,
    vectorScore: 1,
    rrf: 0.03,
  };
}

describe('bộ câu hỏi vàng', () => {
  it('có đúng 30 câu với id duy nhất và đủ trường', () => {
    expect(GOLD_QUESTIONS).toHaveLength(30);
    const ids = new Set(GOLD_QUESTIONS.map((question) => question.id));
    expect(ids.size).toBe(30);
    for (const question of GOLD_QUESTIONS) {
      expect(question.question.length).toBeGreaterThan(10);
      expect(question.documentTitle.length).toBeGreaterThan(0);
      expect(question.contains.length).toBeGreaterThan(5);
    }
  });

  it('phủ đủ 6 tài liệu mẫu, mỗi tài liệu 5 câu', () => {
    const counts = new Map<string, number>();
    for (const question of GOLD_QUESTIONS) {
      counts.set(question.documentTitle, (counts.get(question.documentTitle) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    expect([...counts.values()]).toEqual([5, 5, 5, 5, 5, 5]);
  });

  it('chấm được một lượt chạy giả lập và đối chiếu ngưỡng 80%', async () => {
    const report = await evaluateCitations({
      questions: GOLD_QUESTIONS,
      ask: async (text) => {
        const question = GOLD_QUESTIONS.find((item) => item.question === text);
        if (!question) return { answer: '', hits: [] };
        return {
          answer: `Theo tài liệu [1].`,
          hits: [hit(question.documentTitle, `... ${question.contains} ...`)],
        };
      },
    });

    expect(report.accuracy).toBe(1);
    expect(report.correct).toBe(30);
    expect(report.accuracy).toBeGreaterThanOrEqual(ACCURACY_TARGET);
  });
});
