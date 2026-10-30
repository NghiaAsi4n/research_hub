import { describe, expect, it } from 'vitest';
import { findGoldDocument, GOLD_DOCUMENTS } from './gold-corpus';
import { GOLD_QUESTIONS } from './gold-questions';

describe('tài liệu mẫu của bộ câu hỏi vàng', () => {
  it('có đủ 6 tài liệu với tiêu đề duy nhất', () => {
    expect(GOLD_DOCUMENTS).toHaveLength(6);
    expect(new Set(GOLD_DOCUMENTS.map((document) => document.title)).size).toBe(6);
  });

  it('mỗi câu hỏi có tài liệu tương ứng và đoạn kỳ vọng nằm trong tài liệu đó', () => {
    for (const question of GOLD_QUESTIONS) {
      const document = findGoldDocument(question.documentTitle);
      expect(document, `thiếu tài liệu cho ${question.id}`).toBeDefined();
      expect(document?.markdown.toLowerCase()).toContain(question.contains.toLowerCase());
    }
  });
});
