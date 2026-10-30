import { parseCitations } from './chat';
import type { SearchHit } from './search';

// Đo độ chính xác trích dẫn trên bộ câu hỏi vàng (Giai đoạn 2, T5).
//
// Một câu trả lời được tính đúng khi có ít nhất một trích dẫn trỏ vào đoạn chứa đúng nội dung kỳ
// vọng của câu hỏi đó. Ngưỡng nghiệm thu của giai đoạn là 80%.

export type EvalQuestion = {
  id: string;
  question: string;
  /** Tài liệu chứa câu trả lời. */
  documentTitle: string;
  /** Đoạn văn bản phải xuất hiện trong chunk được trích. */
  contains: string;
};

export type EvalOutcome = {
  id: string;
  question: string;
  cited: boolean;
  correct: boolean;
  matchedIndex: number | null;
};

export type EvalReport = {
  total: number;
  correct: number;
  accuracy: number;
  outcomes: EvalOutcome[];
};

export const ACCURACY_TARGET = 0.8;

export function scoreAnswer(
  question: EvalQuestion,
  answer: string,
  hits: SearchHit[],
): EvalOutcome {
  const citations = parseCitations(answer, hits);
  for (const citation of citations) {
    const hit = hits[citation.index - 1];
    if (!hit) continue;
    if (hit.documentTitle === question.documentTitle && hit.text.includes(question.contains)) {
      return {
        id: question.id,
        question: question.question,
        cited: true,
        correct: true,
        matchedIndex: citation.index,
      };
    }
  }
  return {
    id: question.id,
    question: question.question,
    cited: citations.length > 0,
    correct: false,
    matchedIndex: null,
  };
}

export async function evaluateCitations(input: {
  questions: EvalQuestion[];
  ask: (question: string) => Promise<{ answer: string; hits: SearchHit[] }>;
}): Promise<EvalReport> {
  const outcomes: EvalOutcome[] = [];
  for (const question of input.questions) {
    const { answer, hits } = await input.ask(question.question);
    outcomes.push(scoreAnswer(question, answer, hits));
  }

  const correct = outcomes.filter((outcome) => outcome.correct).length;
  return {
    total: outcomes.length,
    correct,
    accuracy: outcomes.length === 0 ? 0 : correct / outcomes.length,
    outcomes,
  };
}
