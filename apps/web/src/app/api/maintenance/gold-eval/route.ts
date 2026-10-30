import { answerQuestion } from '@research-hub/core/answer';
import { createOllamaChat } from '@research-hub/core/chat';
import { getDb } from '@research-hub/core/db/client';
import { getEnv } from '@research-hub/core/env';
import { type EvalQuestion, evaluateCitations } from '@research-hub/core/eval-citations';
import { GOLD_QUESTIONS } from '@research-hub/core/gold-questions';
import { createEmbedder } from '@/lib/embedder';
import { ollamaConfig } from '@/lib/ollama';

// Chạy bộ 30 câu hỏi vàng và trả tỉ lệ trích dẫn đúng (Giai đoạn 2, T5).
//
// Mỗi câu đi qua đúng đường của chat: tìm kiếm lai → prompt có marker `[n]` → đọc marker → chấm.
// Bảo vệ bằng `CRON_SECRET`; `?limit=` để chạy thử một phần trước khi chạy cả bộ.

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const secret = getEnv().CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get('limit') ?? '');
  const questions: EvalQuestion[] =
    Number.isFinite(limitParam) && limitParam > 0
      ? GOLD_QUESTIONS.slice(0, limitParam)
      : GOLD_QUESTIONS;

  const { endpoint, apiKey } = ollamaConfig();
  const { embed } = createEmbedder();
  const chat = createOllamaChat({ baseUrl: endpoint, apiKey });

  try {
    const report = await evaluateCitations({
      questions,
      ask: async (question) => {
        const result = await answerQuestion({ question, embed, chat, db: getDb() });
        return { answer: result.answer, hits: result.hits };
      },
    });
    return Response.json(report);
  } catch (error) {
    return Response.json(
      { error: 'eval_failed', message: (error as Error).message ?? 'unknown' },
      { status: 502 },
    );
  }
}
