import { PGlite } from '@electric-sql/pglite';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from './db/client';
import { runSteps, runs } from './db/schema';
import { type ResearchDeps, runResearchStep } from './research';
import { renderResearchReport } from './research-report';
import {
  claimResearchRun,
  createResearchRun,
  getResearchRun,
  getResearchUsage,
  persistResearchStep,
  runResearchTurnWithLease,
} from './research-store';

const pg = new PGlite();
const db = drizzle(pg) as unknown as Db;

beforeAll(async () => {
  await pg.exec(`
    create table runs (
      id uuid primary key default gen_random_uuid(),
      kind text not null,
      owner_id text,
      question text,
      status text not null default 'queued',
      plan jsonb,
      cursor jsonb,
      budget_units integer,
      used_units integer not null default 0,
      expires_at timestamptz,
      started_at timestamptz,
      ended_at timestamptz,
      lease_owner text,
      lease_expires_at timestamptz,
      attempt integer not null default 0
    );
    create table run_steps (
      id uuid primary key default gen_random_uuid(),
      run_id uuid not null references runs(id) on delete cascade,
      ord integer not null,
      type text not null,
      state text not null default 'pending',
      idem_key text not null unique,
      input jsonb,
      output jsonb,
      tokens integer,
      units integer,
      ms integer
    );
  `);
});

afterAll(() => pg.close());

beforeEach(async () => {
  await pg.exec('truncate runs restart identity cascade');
});

describe('research cursor persistence', () => {
  it('persists the resume cursor after every completed research step', async () => {
    const run = await createResearchRun({ question: 'hỏi', db });

    const deps: ResearchDeps = {
      plan: async () => ['truy vấn'],
      search: async () => [{ url: 'https://example.com/source', title: 'Nguồn' }],
      read: async () => ({ excerpt: 'Nội dung nguồn' }),
      reflect: async () => ({ notes: ['đủ bằng chứng'], queries: [], done: true }),
      synthesize: async () => 'Báo cáo',
    };
    let state = run.state;
    const expected = [
      { step: 'search', position: 0 },
      { step: 'read', position: 0 },
      { step: 'reflect', position: 0 },
      { step: 'synthesize', position: 0 },
      { step: 'synthesize', position: 1 },
    ];

    for (const cursor of expected) {
      const result = await runResearchTurnWithLease({
        runId: run.id,
        deps,
        db,
        maxStepsPerTurn: 1,
      });
      state = result.state;
      const [stored] = await db
        .select({ cursor: runs.cursor, plan: runs.plan })
        .from(runs)
        .where(eq(runs.id, run.id));

      expect(state.cursor).toEqual(cursor);
      expect(stored?.cursor).toEqual(cursor);
      expect(stored?.plan).toEqual(state);
    }
  });
});

describe('research run leases and step idempotency', () => {
  it('allows only one worker to claim a run at a time', async () => {
    const created = await createResearchRun({ question: 'hỏi', db });

    const [first, second] = await Promise.all([
      claimResearchRun({ runId: created.id, db }),
      claimResearchRun({ runId: created.id, db }),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it('fences an expired worker and records a retried step only once', async () => {
    const now = new Date('2026-10-31T00:00:00.000Z');
    const created = await createResearchRun({ question: 'hỏi', db, now });
    const first = await claimResearchRun({ runId: created.id, db, now, leaseMs: 10 });
    if (!first) throw new Error('First worker did not claim the run');

    const retry = await claimResearchRun({
      runId: created.id,
      db,
      now: new Date(now.getTime() + 11),
      leaseMs: 10,
    });
    if (!retry) throw new Error('Second worker did not reclaim the expired lease');
    expect(retry.attempt).toBe(first.attempt + 1);

    const deps: ResearchDeps = {
      plan: async () => ['query'],
      search: async () => [],
      read: async () => ({ excerpt: '' }),
      reflect: async () => ({ notes: [], queries: [], done: true }),
      synthesize: async () => 'report',
    };
    const progress = await runResearchStep(first.state, deps);

    const firstAttemptSaved = await persistResearchStep({
      runId: created.id,
      leaseOwner: first.leaseOwner,
      attempt: first.attempt,
      previous: first.state,
      state: progress.state,
      done: progress.done,
      usage: { tokens: 4, units: 1 },
      elapsedMs: 10,
      db,
      now: new Date(now.getTime() + 12),
    });
    expect(firstAttemptSaved).toBe('lease_lost');

    const saved = await persistResearchStep({
      runId: created.id,
      leaseOwner: retry.leaseOwner,
      attempt: retry.attempt,
      previous: retry.state,
      state: progress.state,
      done: progress.done,
      usage: { tokens: 4, units: 1 },
      elapsedMs: 10,
      db,
      now: new Date(now.getTime() + 12),
    });
    const repeated = await persistResearchStep({
      runId: created.id,
      leaseOwner: retry.leaseOwner,
      attempt: retry.attempt,
      previous: retry.state,
      state: progress.state,
      done: progress.done,
      usage: { tokens: 4, units: 1 },
      elapsedMs: 10,
      db,
      now: new Date(now.getTime() + 12),
    });
    const steps = await db.select().from(runs).where(eq(runs.id, created.id));
    const storedSteps = await db
      .select({ tokens: runSteps.tokens })
      .from(runSteps)
      .where(eq(runSteps.runId, created.id));
    const count = await db.execute(sql`select count(*)::int as count from run_steps`);

    expect(saved).toBe('saved');
    expect(repeated).toBe('duplicate');
    expect(count.rows[0]?.count).toBe(1);
    expect(steps[0]?.usedUnits).toBe(1);
    expect(storedSteps[0]?.tokens).toBe(4);
  });

  it('persists a bounded turn and resumes from that state on the next turn', async () => {
    const now = new Date('2026-10-31T00:00:00.000Z');
    const created = await createResearchRun({ question: 'hỏi', db, now });
    const plan = vi.fn(async () => ['query']);
    const deps: ResearchDeps = {
      plan,
      search: async () => [{ url: 'https://example.com/a', title: 'Nguồn A' }],
      read: async (source) => ({ excerpt: source.title }),
      reflect: async () => ({ notes: ['đủ'], queries: [], done: true }),
      synthesize: async () => 'report',
    };

    const firstTurn = await runResearchTurnWithLease({
      runId: created.id,
      deps,
      db,
      now: () => now.getTime(),
      turnBudgetMs: 240_000,
      maxStepsPerTurn: 2,
    });
    expect(firstTurn).toMatchObject({ hasMore: true, state: { step: 'read', steps: 2 } });

    const secondTurn = await runResearchTurnWithLease({
      runId: created.id,
      deps,
      db,
      now: () => now.getTime() + 1,
      turnBudgetMs: 240_000,
      maxStepsPerTurn: 20,
    });

    expect(secondTurn).toMatchObject({ done: true, hasMore: false, state: { report: 'report' } });
    expect(plan).toHaveBeenCalledTimes(1);
    const stepRows = await db.select().from(runSteps).where(eq(runSteps.runId, created.id));
    expect(stepRows.map((step) => step.type)).toEqual([
      'plan',
      'search',
      'read',
      'reflect',
      'synthesize',
    ]);
  });

  it('stops before the next step when the run reaches its unit budget', async () => {
    const now = new Date('2026-10-31T00:00:00.000Z');
    const created = await createResearchRun({ question: 'hỏi', budgetUnits: 2, db, now });
    const deps: ResearchDeps = {
      plan: async () => ['query'],
      search: async () => [{ url: 'https://example.com/a', title: 'Nguồn A' }],
      read: async (source) => ({ excerpt: source.title }),
      reflect: async () => ({ notes: ['đủ'], queries: [], done: true }),
      synthesize: async () => 'report',
    };

    const result = await runResearchTurnWithLease({
      runId: created.id,
      deps,
      db,
      now: () => now.getTime(),
      turnBudgetMs: 240_000,
      maxStepsPerTurn: 20,
    });
    const stored = await db.select().from(runs).where(eq(runs.id, created.id));

    expect(result).toMatchObject({
      hasMore: false,
      stopReason: 'unit_budget',
      status: 'budget_exhausted',
      state: { step: 'read', steps: 2 },
    });
    expect(result.state.report).toContain('Báo cáo một phần');
    expect(result.state.report).toContain('đã chạm hạn mức');
    expect(stored[0]?.usedUnits).toBe(2);
  });

  it('records step tokens and warns before the configured unit limit', async () => {
    const now = new Date('2026-10-31T00:00:00.000Z');
    const created = await createResearchRun({ question: 'hỏi', budgetUnits: 5, db, now });
    let tokens = 0;
    const countToken = () => {
      tokens += 10;
    };
    const deps: ResearchDeps = {
      plan: async () => {
        countToken();
        return ['query'];
      },
      search: async () => {
        countToken();
        return [{ url: 'https://example.com/a', title: 'Nguồn A' }];
      },
      read: async (source) => {
        countToken();
        return { excerpt: source.title };
      },
      reflect: async () => {
        countToken();
        return { notes: ['đủ'], queries: [], done: true };
      },
      synthesize: async () => {
        countToken();
        return 'report';
      },
      usage: () => ({ tokens, units: 0 }),
    };

    await runResearchTurnWithLease({
      runId: created.id,
      deps,
      db,
      now: () => now.getTime(),
      maxStepsPerTurn: 4,
    });
    const usage = await getResearchUsage(created.id, db);

    expect(usage).toMatchObject({
      tokens: 40,
      units: 4,
      budgetUnits: 5,
      warning: true,
      exhausted: false,
    });
    expect(usage.steps).toHaveLength(4);
  });

  it('hides a research run and its usage from a different owner', async () => {
    const created = await createResearchRun({
      question: 'private question',
      ownerId: 'user-1',
      db,
    });

    expect(await getResearchRun(created.id, db, 'user-1')).not.toBeNull();
    expect(await getResearchRun(created.id, db, 'user-2')).toBeNull();
    await expect(getResearchUsage(created.id, db, 'user-2')).rejects.toThrow(
      'Research run was not found',
    );
  });

  it('keeps token usage for a step that fails before completion', async () => {
    const created = await createResearchRun({ question: 'hỏi', db });

    await expect(
      runResearchTurnWithLease({
        runId: created.id,
        db,
        deps: ({ onUsage }) => ({
          plan: async () => {
            await onUsage({ tokens: 17, units: 0 });
            throw new Error('provider failed');
          },
          search: async () => [],
          read: async () => ({ excerpt: '' }),
          reflect: async () => ({ notes: [], queries: [], done: false }),
          synthesize: async () => '',
        }),
      }),
    ).rejects.toThrow('provider failed');
    const [step] = await db
      .select({ tokens: runSteps.tokens, units: runSteps.units, state: runSteps.state })
      .from(runSteps)
      .where(eq(runSteps.runId, created.id));
    const [run] = await db.select().from(runs).where(eq(runs.id, created.id));

    expect(step).toEqual({ tokens: 17, units: 1, state: 'aborted' });
    expect(run?.status).toBe('queued');
  });

  it('produces a source-linked report after reading six sources', async () => {
    const created = await createResearchRun({ question: 'hỏi', db });
    const deps: ResearchDeps = {
      plan: async () => ['query'],
      search: async () =>
        Array.from({ length: 6 }, (_, index) => ({
          url: `https://example.com/source-${index + 1}`,
          title: `Nguồn ${index + 1}`,
        })),
      read: async (source) => ({ excerpt: `Bằng chứng cho ${source.title}` }),
      reflect: async () => ({ notes: ['đủ bằng chứng'], queries: [], done: true }),
      synthesize: async (state) =>
        renderResearchReport(state, {
          conclusion: 'Kết luận có căn cứ [1] [2] [3] [4] [5] [6].',
        }),
    };

    const result = await runResearchTurnWithLease({
      runId: created.id,
      deps,
      db,
      maxStepsPerTurn: 20,
    });

    expect(result).toMatchObject({ done: true, hasMore: false });
    expect(result.state.report).toContain('## Kết luận');
    expect(result.state.report).toContain('## Nguồn');
    expect(result.state.report).toContain('[Nguồn 6](https://example.com/source-6)');
    expect(result.state.report?.match(/^### \[/gm)).toHaveLength(6);
  });

  it('resumes the interrupted step after a turn is cut around second 300', async () => {
    const created = await createResearchRun({
      question: 'hỏi',
      db,
      now: new Date(0),
      sessionBudgetMs: 3_600_000,
    });
    const hanging = new Promise<string[]>(() => {});
    const beforeCut = await runResearchTurnWithLease({
      runId: created.id,
      db,
      now: () => 0,
      turnBudgetMs: 1,
      deps: () => ({
        plan: async () => hanging,
        search: async () => [],
        read: async () => ({ excerpt: '' }),
        reflect: async () => ({ notes: [], queries: [], done: false }),
        synthesize: async () => '',
      }),
    });
    expect(beforeCut).toMatchObject({
      hasMore: true,
      stopReason: 'turn_budget',
      state: { step: 'plan', steps: 0 },
    });
    const [cutStep] = await db
      .select({ state: runSteps.state })
      .from(runSteps)
      .where(eq(runSteps.runId, created.id));
    expect(cutStep?.state).toBe('aborted');

    const plan = vi.fn(async () => ['query']);
    const afterResume = await runResearchTurnWithLease({
      runId: created.id,
      db,
      now: () => 300_000,
      maxStepsPerTurn: 1,
      deps: {
        plan,
        search: async () => [],
        read: async () => ({ excerpt: '' }),
        reflect: async () => ({ notes: [], queries: [], done: false }),
        synthesize: async () => '',
      },
    });
    const stepRows = await db
      .select({ type: runSteps.type, state: runSteps.state, units: runSteps.units })
      .from(runSteps)
      .where(eq(runSteps.runId, created.id));

    expect(afterResume).toMatchObject({ state: { step: 'search', steps: 1 } });
    expect(plan).toHaveBeenCalledTimes(1);
    expect(stepRows).toEqual([{ type: 'plan', state: 'done', units: 1 }]);
  });

  it('returns a completed run unchanged after the session expiry time', async () => {
    const created = await createResearchRun({
      question: 'hỏi',
      db,
      now: new Date(0),
      sessionBudgetMs: 1_000,
    });
    const state = {
      ...created.state,
      report: '# Báo cáo đầy đủ\n\nNội dung đã hoàn tất.',
    };
    await db
      .update(runs)
      .set({ status: 'done', plan: state, cursor: state.cursor, endedAt: new Date(500) })
      .where(eq(runs.id, created.id));
    const deps: ResearchDeps = {
      plan: async () => {
        throw new Error('completed run must not call the model');
      },
      search: async () => [],
      read: async () => ({ excerpt: '' }),
      reflect: async () => ({ notes: [], queries: [], done: false }),
      synthesize: async () => '',
    };

    const result = await runResearchTurnWithLease({
      runId: created.id,
      deps,
      db,
      now: () => 2_000,
    });

    expect(result).toMatchObject({ status: 'done', done: true, hasMore: false });
    expect(result.state.report).toBe(state.report);
  });
});
