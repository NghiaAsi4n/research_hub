import { CHAT_MODEL } from '@research-hub/core/chat';
import {
  getResearchRun,
  getResearchUsage,
  runResearchTurnWithLease,
} from '@research-hub/core/research-store';
import { z } from 'zod';
import { guardRequest } from '@/lib/guard';
import { createResearchDeps } from '@/lib/research-deps';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RunIdSchema = z.string().uuid();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await guardRequest({ route: 'research', model: CHAT_MODEL });
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!RunIdSchema.safeParse(id).success) {
    return Response.json({ error: 'invalid_run_id' }, { status: 400 });
  }

  try {
    const run = await getResearchRun(id, undefined, auth.subject);
    if (!run) return Response.json({ error: 'research_run_not_found' }, { status: 404 });
    const usage = await getResearchUsage(id, undefined, auth.subject);
    return Response.json(
      {
        runId: run.id,
        status: run.status,
        question: run.state.question,
        cursor: run.state.cursor,
        report: run.state.report,
        hasMore: run.status === 'queued',
        busy: run.status === 'running',
        stopReason:
          run.status === 'budget_exhausted'
            ? 'unit_budget'
            : run.status === 'expired'
              ? 'session_budget'
              : undefined,
        expiresAt: run.expiresAt?.toISOString() ?? null,
        usage,
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch {
    return Response.json({ error: 'research_run_unavailable' }, { status: 503 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await guardRequest({ route: 'research', model: CHAT_MODEL });
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!RunIdSchema.safeParse(id).success) {
    return Response.json({ error: 'invalid_run_id' }, { status: 400 });
  }

  try {
    const run = await getResearchRun(id, undefined, auth.subject);
    if (!run) return Response.json({ error: 'research_run_not_found' }, { status: 404 });
    const result = await runResearchTurnWithLease({
      runId: id,
      deps: ({ onUsage }) => createResearchDeps({ onUsage }),
    });
    const usage = await getResearchUsage(id, undefined, auth.subject);
    if (result.status === 'busy') {
      return Response.json({ error: 'research_run_busy', runId: id }, { status: 409 });
    }
    return Response.json(
      {
        runId: id,
        status: result.status,
        cursor: result.state.cursor,
        hasMore: result.hasMore,
        stopReason: result.stopReason,
        report: result.state.report,
        usage,
      },
      {
        status: result.hasMore ? 202 : 200,
        headers: { 'cache-control': 'private, no-store' },
      },
    );
  } catch {
    return Response.json({ error: 'research_run_failed' }, { status: 503 });
  }
}
