import { describe, expect, it } from 'vitest';
import { answerQuestion } from './answer';
import type { SearchHit } from './search';

function hit(chunkId: string, documentTitle: string, text: string): SearchHit {
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

const embed = async (texts: string[]) => texts.map(() => [1, 2, 3, 4]);

describe('answerQuestion', () => {
  it('asks the model with the retrieved chunks and maps markers to citations', async () => {
    const searched: string[] = [];
    const messagesSeen: string[] = [];

    const result = await answerQuestion({
      question: 'Thời hạn thuê là bao lâu?',
      embed,
      search: async (question) => {
        searched.push(question);
        return [hit('a', 'Hợp đồng thuê nhà ở', 'thời hạn thuê là 12 tháng')];
      },
      chat: async (messages) => {
        messagesSeen.push(messages[1]?.content ?? '');
        return 'Thời hạn là 12 tháng [1].';
      },
    });

    expect(searched).toEqual(['Thời hạn thuê là bao lâu?']);
    expect(messagesSeen[0]).toContain('thời hạn thuê là 12 tháng');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.chunkId).toBe('a');
  });

  it('returns an empty answer without calling the model when nothing matches', async () => {
    let called = false;

    const result = await answerQuestion({
      question: 'chứng khoán',
      embed,
      search: async () => [],
      chat: async () => {
        called = true;
        return 'x';
      },
    });

    expect(called).toBe(false);
    expect(result).toEqual({ answer: '', hits: [], citations: [] });
  });
});
