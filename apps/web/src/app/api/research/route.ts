import { CHAT_MODEL } from '@research-hub/core/chat';
import {
  createResearchRun,
  getResearchUsage,
  runResearchTurnWithLease,
} from '@research-hub/core/research-store';
import { z } from 'zod';
import { guardRequest } from '@/lib/guard';
import { createResearchDeps } from '@/lib/research-deps';

export const runtime = 'nodejs';
export const maxDuration = 300;

const CreateResearchSchema = z
  .object({
    question: z.string().trim().min(1).max(1000),
    sessionBudgetMs: z.number().int().min(60_000).max(86_400_000).optional().default(3_600_000),
    budgetUnits: z.number().int().min(1).max(200).optional().default(40),
  })
  .strict();

export async function POST(request: Request) {
  const auth = await guardRequest({ route: 'research', model: CHAT_MODEL });
  if (!auth.ok) return auth.response;

  const raw = await request.json().catch(() => null);
  const parsed = CreateResearchSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: 'invalid_research_request' }, { status: 400 });

  try {
    const created = await createResearchRun({
      question: parsed.data.question,
      ownerId: auth.subject,
      sessionBudgetMs: parsed.data.sessionBudgetMs,
      budgetUnits: parsed.data.budgetUnits,
    });
    const result = await runResearchTurnWithLease({
      runId: created.id,
      deps: ({ onUsage }) => createResearchDeps({ onUsage }),
    });
    const usage = await getResearchUsage(created.id, undefined, auth.subject);
    const response = {
      runId: created.id,
      status: result.status,
      cursor: result.state.cursor,
      hasMore: result.hasMore,
      stopReason: result.stopReason,
      report: result.state.report,
      usage,
    };
    return Response.json(response, {
      status: result.status === 'busy' ? 409 : result.hasMore ? 202 : 200,
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch {
    return Response.json({ error: 'research_run_failed' }, { status: 503 });
  }
}
