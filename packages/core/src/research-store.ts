import { and, asc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { getDb } from './db/client';
import { runSteps, runs } from './db/schema';
import type { ResearchDeps, ResearchState, ResearchTurnResult, ResearchUsage } from './research';
import { initResearch, runResearchTurn } from './research';
import { renderResearchReport } from './research-report';
import { assertNoSecrets } from './secrets';

export const DEFAULT_RESEARCH_SESSION_MS = 60 * 60 * 1000;
export const DEFAULT_RESEARCH_LEASE_MS = 300_000;

export type ClaimedResearchRun = {
  id: string;
  leaseOwner: string;
  attempt: number;
  state: ResearchState;
  budgetUnits: number | null;
  usedUnits: number;
  expiresAt: Date | null;
};

export type PersistResearchStepResult = 'saved' | 'duplicate' | 'budget_exhausted' | 'lease_lost';
export type BeginResearchStepResult =
  | 'started'
  | 'budget_exhausted'
  | 'lease_lost'
  | 'already_done';
export type ResearchDepsFactory = (input: {
  onUsage: (usage: ResearchUsage) => Promise<void>;
}) => ResearchDeps;

export type StoredResearchRun = {
  id: string;
  ownerId: string | null;
  status: string;
  state: ResearchState;
  budgetUnits: number | null;
  usedUnits: number;
  expiresAt: Date | null;
  attempt: number;
};

export type ResearchUsageSummary = {
  runId: string;
  status: string;
  tokens: number;
  units: number;
  budgetUnits: number | null;
  remainingUnits: number | null;
  warning: boolean;
  exhausted: boolean;
  steps: Array<{
    ord: number;
    type: string;
    tokens: number | null;
    units: number | null;
    ms: number | null;
  }>;
};

function isResearchState(value: unknown): value is ResearchState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<ResearchState>;
  return (
    typeof state.question === 'string' &&
    typeof state.step === 'string' &&
    typeof state.cursor === 'object' &&
    state.cursor !== null &&
    Array.isArray(state.plan) &&
    Array.isArray(state.pendingQueries) &&
    Array.isArray(state.sources) &&
    Array.isArray(state.notes) &&
    typeof state.steps === 'number'
  );
}

export async function createResearchRun(input: {
  question: string;
  ownerId?: string;
  sessionBudgetMs?: number;
  budgetUnits?: number;
  db?: Db;
  now?: Date;
}): Promise<{ id: string; state: ResearchState; expiresAt: Date }> {
  const db = input.db ?? getDb();
  const now = input.now ?? new Date();
  const sessionBudgetMs = Math.max(1, input.sessionBudgetMs ?? DEFAULT_RESEARCH_SESSION_MS);
  const expiresAt = new Date(now.getTime() + sessionBudgetMs);
  const state = initResearch(input.question);
  const [created] = await db
    .insert(runs)
    .values({
      kind: 'research',
      ownerId: input.ownerId,
      question: input.question,
      status: 'queued',
      plan: state,
      cursor: state.cursor,
      budgetUnits: input.budgetUnits ?? null,
      expiresAt,
    })
    .returning({ id: runs.id });
  if (!created) throw new Error('Research run was not created');
  return { id: created.id, state, expiresAt };
}

export async function claimResearchRun(input: {
  runId: string;
  db?: Db;
  now?: Date;
  leaseMs?: number;
  leaseOwner?: string;
}): Promise<ClaimedResearchRun | null> {
  const db = input.db ?? getDb();
  const now = input.now ?? new Date();
  const leaseOwner = input.leaseOwner ?? crypto.randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + (input.leaseMs ?? DEFAULT_RESEARCH_LEASE_MS));
  const [claimed] = await db
    .update(runs)
    .set({
      status: 'running',
      leaseOwner,
      leaseExpiresAt,
      attempt: sql`${runs.attempt} + 1`,
      startedAt: sql`coalesce(${runs.startedAt}, ${now})`,
    })
    .where(
      and(
        eq(runs.id, input.runId),
        eq(runs.kind, 'research'),
        or(isNull(runs.expiresAt), gt(runs.expiresAt, now)),
        or(
          eq(runs.status, 'queued'),
          and(eq(runs.status, 'running'), lte(runs.leaseExpiresAt, now)),
        ),
      ),
    )
    .returning({
      id: runs.id,
      plan: runs.plan,
      attempt: runs.attempt,
      budgetUnits: runs.budgetUnits,
      usedUnits: runs.usedUnits,
      expiresAt: runs.expiresAt,
    });

  if (!claimed) return null;
  if (!isResearchState(claimed.plan)) throw new Error('Research run has an invalid saved state');
  return {
    id: claimed.id,
    leaseOwner,
    attempt: claimed.attempt,
    state: claimed.plan,
    budgetUnits: claimed.budgetUnits,
    usedUnits: claimed.usedUnits,
    expiresAt: claimed.expiresAt,
  };
}

export async function getResearchRun(
  runId: string,
  db?: Db,
  ownerId?: string,
): Promise<StoredResearchRun | null> {
  const [row] = await (db ?? getDb())
    .select({
      id: runs.id,
      ownerId: runs.ownerId,
      status: runs.status,
      plan: runs.plan,
      budgetUnits: runs.budgetUnits,
      usedUnits: runs.usedUnits,
      expiresAt: runs.expiresAt,
      attempt: runs.attempt,
    })
    .from(runs)
    .where(
      and(
        eq(runs.id, runId),
        eq(runs.kind, 'research'),
        ownerId ? eq(runs.ownerId, ownerId) : undefined,
      ),
    )
    .limit(1);
  if (!row) return null;
  if (!isResearchState(row.plan)) throw new Error('Research run has an invalid saved state');
  return { ...row, state: row.plan };
}

export async function getResearchUsage(
  runId: string,
  db?: Db,
  ownerId?: string,
): Promise<ResearchUsageSummary> {
  const handle = db ?? getDb();
  const [run] = await handle
    .select({ status: runs.status, budgetUnits: runs.budgetUnits, usedUnits: runs.usedUnits })
    .from(runs)
    .where(
      and(
        eq(runs.id, runId),
        eq(runs.kind, 'research'),
        ownerId ? eq(runs.ownerId, ownerId) : undefined,
      ),
    )
    .limit(1);
  if (!run) throw new Error('Research run was not found');

  const steps = await handle
    .select({
      ord: runSteps.ord,
      type: runSteps.type,
      tokens: runSteps.tokens,
      units: runSteps.units,
      ms: runSteps.ms,
    })
    .from(runSteps)
    .where(eq(runSteps.runId, runId))
    .orderBy(asc(runSteps.ord));
  const usedUnits = run.usedUnits;
  const budgetUnits = run.budgetUnits;
  const remainingUnits = budgetUnits === null ? null : Math.max(0, budgetUnits - usedUnits);
  return {
    runId,
    status: run.status,
    tokens: steps.reduce((total, step) => total + (step.tokens ?? 0), 0),
    units: usedUnits,
    budgetUnits,
    remainingUnits,
    warning:
      budgetUnits !== null && usedUnits < budgetUnits && usedUnits >= Math.ceil(budgetUnits * 0.8),
    exhausted:
      run.status === 'budget_exhausted' || (budgetUnits !== null && usedUnits >= budgetUnits),
    steps,
  };
}

export async function persistResearchStep(input: {
  runId: string;
  leaseOwner: string;
  attempt: number;
  previous: ResearchState;
  state: ResearchState;
  done: boolean;
  usage: ResearchUsage;
  elapsedMs: number;
  db?: Db;
  now?: Date;
}): Promise<PersistResearchStepResult> {
  // Không ghi bước nào chứa khoá bí mật vào `run_steps`/`runs.plan` (Giai đoạn 5, T4).
  assertNoSecrets(JSON.stringify(input.state), 'run_steps');
  const db = input.db ?? getDb();
  const now = input.now ?? new Date();
  const idemKey = `research:${input.runId}:step:${input.previous.steps}`;
  const result = await db.execute(sql`
    WITH existing AS (
      SELECT id, state FROM ${runSteps} WHERE idem_key = ${idemKey}
    ), updated AS (
      UPDATE ${runs}
      SET plan = ${JSON.stringify(input.state)}::jsonb,
          cursor = ${JSON.stringify(input.state.cursor)}::jsonb,
          used_units = used_units + CASE
            WHEN EXISTS (SELECT 1 FROM existing) THEN 0
            ELSE ${input.usage.units}
          END,
          status = CASE
            WHEN ${input.done} THEN 'done'
            WHEN NOT EXISTS (SELECT 1 FROM existing)
              AND budget_units IS NOT NULL
              AND used_units + ${input.usage.units} >= budget_units THEN 'budget_exhausted'
            ELSE 'running'
          END,
          ended_at = CASE
            WHEN ${input.done} OR (
              NOT EXISTS (SELECT 1 FROM existing)
              AND budget_units IS NOT NULL
              AND used_units + ${input.usage.units} >= budget_units
            )
              THEN ${now}
            ELSE ended_at
          END,
          lease_owner = CASE
            WHEN ${input.done} OR (
              NOT EXISTS (SELECT 1 FROM existing)
              AND budget_units IS NOT NULL
              AND used_units + ${input.usage.units} >= budget_units
            )
              THEN NULL
            ELSE lease_owner
          END,
          lease_expires_at = CASE
            WHEN ${input.done} OR (
              NOT EXISTS (SELECT 1 FROM existing)
              AND budget_units IS NOT NULL
              AND used_units + ${input.usage.units} >= budget_units
            )
              THEN NULL
            ELSE lease_expires_at
          END
      WHERE id = ${input.runId}
        AND kind = 'research'
        AND status = 'running'
        AND lease_owner = ${input.leaseOwner}
        AND attempt = ${input.attempt}
        AND lease_expires_at > ${now}
        AND (
          NOT EXISTS (SELECT 1 FROM existing)
          OR EXISTS (SELECT 1 FROM existing WHERE state <> 'done')
        )
      RETURNING id, status
    ), updated_step AS (
      UPDATE ${runSteps}
      SET state = 'done', output = ${JSON.stringify(input.state)}::jsonb,
          tokens = coalesce(tokens, 0) + ${input.usage.tokens},
          ms = coalesce(ms, 0) + ${Math.max(0, Math.trunc(input.elapsedMs))}
      WHERE idem_key = ${idemKey} AND run_id = ${input.runId}
        AND EXISTS (SELECT 1 FROM updated)
      RETURNING id
    ), inserted AS (
      INSERT INTO ${runSteps} (run_id, ord, type, state, idem_key, input, output, tokens, units, ms)
      SELECT id, ${input.previous.steps}, ${input.previous.step}, 'done', ${idemKey},
             ${JSON.stringify(input.previous)}::jsonb, ${JSON.stringify(input.state)}::jsonb,
             ${input.usage.tokens}, ${input.usage.units}, ${Math.max(0, Math.trunc(input.elapsedMs))}
      FROM updated WHERE NOT EXISTS (SELECT 1 FROM existing)
      ON CONFLICT (idem_key) DO NOTHING
      RETURNING id
    )
    SELECT
      (SELECT status FROM updated LIMIT 1) AS status,
      EXISTS (SELECT 1 FROM existing) AS duplicate,
      EXISTS (
        SELECT 1 FROM ${runs}
        WHERE id = ${input.runId} AND status = 'running'
          AND lease_owner = ${input.leaseOwner} AND attempt = ${input.attempt}
          AND lease_expires_at > ${now}
      ) AS lease_valid
  `);
  const row = result.rows[0] as
    | { status: string | null; duplicate: boolean; lease_valid: boolean }
    | undefined;
  if (!row?.status && row?.duplicate && row.lease_valid) return 'duplicate';
  if (!row?.status && row?.lease_valid) return 'lease_lost';
  if (!row?.status) return 'lease_lost';
  return row.status === 'budget_exhausted' ? 'budget_exhausted' : 'saved';
}

export async function beginResearchStep(input: {
  runId: string;
  leaseOwner: string;
  attempt: number;
  state: ResearchState;
  db?: Db;
  now?: Date;
}): Promise<BeginResearchStepResult> {
  assertNoSecrets(JSON.stringify(input.state), 'run_steps');
  const db = input.db ?? getDb();
  const now = input.now ?? new Date();
  const idemKey = `research:${input.runId}:step:${input.state.steps}`;
  const result = await db.execute(sql`
    WITH existing AS (
      SELECT id, state FROM ${runSteps} WHERE idem_key = ${idemKey}
    ), updated AS (
      UPDATE ${runs}
      SET used_units = used_units + CASE WHEN EXISTS (SELECT 1 FROM existing) THEN 0 ELSE 1 END
      WHERE id = ${input.runId} AND kind = 'research' AND status = 'running'
        AND lease_owner = ${input.leaseOwner} AND attempt = ${input.attempt}
        AND lease_expires_at > ${now}
        AND NOT EXISTS (SELECT 1 FROM existing WHERE state = 'done')
        AND (EXISTS (SELECT 1 FROM existing) OR budget_units IS NULL OR used_units < budget_units)
      RETURNING id
    ), exhausted AS (
      UPDATE ${runs}
      SET status = 'budget_exhausted', ended_at = ${now},
          lease_owner = NULL, lease_expires_at = NULL
      WHERE id = ${input.runId} AND kind = 'research' AND status = 'running'
        AND lease_owner = ${input.leaseOwner} AND attempt = ${input.attempt}
        AND lease_expires_at > ${now}
        AND budget_units IS NOT NULL AND used_units >= budget_units
        AND NOT EXISTS (SELECT 1 FROM updated)
      RETURNING id
    ), step AS (
      INSERT INTO ${runSteps} (run_id, ord, type, state, idem_key, input, units)
      SELECT id, ${input.state.steps}, ${input.state.step}, 'running', ${idemKey},
             ${JSON.stringify(input.state)}::jsonb, 1
      FROM updated
      ON CONFLICT (idem_key) DO UPDATE SET state = 'running'
      WHERE ${runSteps}.state <> 'done'
      RETURNING id
    )
    SELECT
      EXISTS (SELECT 1 FROM updated) AS started,
      EXISTS (SELECT 1 FROM exhausted) AS exhausted,
      EXISTS (SELECT 1 FROM existing WHERE state = 'done') AS already_done,
      EXISTS (
        SELECT 1 FROM ${runs} WHERE id = ${input.runId} AND status = 'running'
          AND lease_owner = ${input.leaseOwner} AND attempt = ${input.attempt}
          AND lease_expires_at > ${now}
      ) AS lease_valid
  `);
  const row = result.rows[0] as
    | { started: boolean; exhausted: boolean; already_done: boolean; lease_valid: boolean }
    | undefined;
  if (row?.started) return 'started';
  if (row?.exhausted) return 'budget_exhausted';
  if (row?.already_done && row.lease_valid) return 'already_done';
  return 'lease_lost';
}

async function persistResearchStepTokens(input: {
  runId: string;
  leaseOwner: string;
  attempt: number;
  state: ResearchState;
  tokens: number;
  db: Db;
  now: Date;
}): Promise<void> {
  const idemKey = `research:${input.runId}:step:${input.state.steps}`;
  const result = await input.db.execute(sql`
    UPDATE ${runSteps} AS step
    SET tokens = coalesce(step.tokens, 0) + ${Math.max(0, Math.trunc(input.tokens))}
    FROM ${runs} AS run
    WHERE step.run_id = ${input.runId} AND step.idem_key = ${idemKey} AND step.state = 'running'
      AND run.id = step.run_id AND run.status = 'running'
      AND run.lease_owner = ${input.leaseOwner} AND run.attempt = ${input.attempt}
      AND run.lease_expires_at > ${input.now}
    RETURNING step.id
  `);
  if (result.rows.length === 0) throw new Error('Research run lease was lost');
}

async function abortActiveResearchStep(input: {
  runId: string;
  leaseOwner: string;
  attempt: number;
  state: ResearchState;
  db: Db;
  now: Date;
}): Promise<void> {
  const idemKey = `research:${input.runId}:step:${input.state.steps}`;
  try {
    await input.db.execute(sql`
      UPDATE ${runSteps} AS step
      SET state = 'aborted'
      FROM ${runs} AS run
      WHERE step.run_id = ${input.runId} AND step.idem_key = ${idemKey}
        AND step.state = 'running'
        AND run.id = step.run_id AND run.status = 'running'
        AND run.lease_owner = ${input.leaseOwner} AND run.attempt = ${input.attempt}
        AND run.lease_expires_at > ${input.now}
    `);
  } catch {
    console.warn(JSON.stringify({ event: 'research_step_abort_mark_failed' }));
  }
}

export async function runResearchTurnWithLease(input: {
  runId: string;
  deps: ResearchDeps | ResearchDepsFactory;
  db?: Db;
  now?: () => number;
  turnBudgetMs?: number;
  maxStepsPerTurn?: number;
  leaseMs?: number;
}): Promise<ResearchTurnResult & { runId: string; status: string; attempt?: number }> {
  const db = input.db ?? getDb();
  const now = input.now ?? Date.now;
  const initial = await getResearchRun(input.runId, db);
  if (!initial) throw new Error('Research run was not found');
  const startedAt = now();

  if (['done', 'budget_exhausted', 'expired', 'failed'].includes(initial.status)) {
    return {
      runId: input.runId,
      status: initial.status,
      state: initial.state,
      done: initial.status === 'done',
      hasMore: false,
      stopReason: initial.status === 'budget_exhausted' ? 'unit_budget' : undefined,
    };
  }

  if (initial.expiresAt && initial.expiresAt.getTime() <= startedAt) {
    const state = {
      ...initial.state,
      report: renderResearchReport(initial.state, { partialReason: 'session_budget' }),
    };
    await db
      .update(runs)
      .set({
        status: 'expired',
        plan: state,
        cursor: state.cursor,
        endedAt: new Date(startedAt),
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      .where(
        and(eq(runs.id, input.runId), or(eq(runs.status, 'queued'), eq(runs.status, 'running'))),
      );
    return {
      runId: input.runId,
      status: 'expired',
      state,
      done: false,
      hasMore: false,
      stopReason: 'session_budget',
    };
  }

  const claimed = await claimResearchRun({
    runId: input.runId,
    db,
    now: new Date(startedAt),
    leaseMs: input.leaseMs,
  });
  if (!claimed) {
    return {
      runId: input.runId,
      status: 'busy',
      state: initial.state,
      done: false,
      hasMore: true,
    };
  }

  let activeStep: ResearchState | null = null;
  let activeTokensPersisted = 0;
  const deps =
    typeof input.deps === 'function'
      ? input.deps({
          onUsage: async (usage) => {
            if (!activeStep || usage.tokens <= 0) return;
            await persistResearchStepTokens({
              runId: input.runId,
              leaseOwner: claimed.leaseOwner,
              attempt: claimed.attempt,
              state: activeStep,
              tokens: usage.tokens,
              db,
              now: new Date(now()),
            });
            activeTokensPersisted += Math.max(0, Math.trunc(usage.tokens));
          },
        })
      : input.deps;

  let result: ResearchTurnResult;
  try {
    result = await runResearchTurn(claimed.state, deps, {
      turnBudgetMs: input.turnBudgetMs,
      maxStepsPerTurn: input.maxStepsPerTurn,
      sessionExpiresAt: claimed.expiresAt?.getTime(),
      now,
      beforeStep: async (state) => {
        activeStep = state;
        activeTokensPersisted = 0;
        const started = await beginResearchStep({
          runId: input.runId,
          leaseOwner: claimed.leaseOwner,
          attempt: claimed.attempt,
          state,
          db,
          now: new Date(now()),
        });
        if (started === 'budget_exhausted') {
          return { continue: false, stopReason: 'unit_budget' };
        }
        if (started === 'lease_lost') throw new Error('Research run lease was lost');
        if (started === 'already_done')
          throw new Error('Research run cursor conflicts with a completed step');
        return { continue: true };
      },
      persist: async ({ previous, state, done, usage, elapsedMs }) => {
        const saved = await persistResearchStep({
          runId: input.runId,
          leaseOwner: claimed.leaseOwner,
          attempt: claimed.attempt,
          previous,
          state,
          done,
          usage: {
            ...usage,
            tokens: Math.max(0, usage.tokens - activeTokensPersisted),
          },
          elapsedMs,
          db,
          now: new Date(now()),
        });
        if (saved === 'lease_lost') throw new Error('Research run lease was lost');
        activeStep = null;
        activeTokensPersisted = 0;
        return saved === 'budget_exhausted'
          ? { continue: false, stopReason: 'unit_budget' }
          : { continue: true };
      },
    });
  } catch (error) {
    if (activeStep) {
      await abortActiveResearchStep({
        runId: input.runId,
        leaseOwner: claimed.leaseOwner,
        attempt: claimed.attempt,
        state: activeStep,
        db,
        now: new Date(now()),
      });
      activeStep = null;
    }
    await db
      .update(runs)
      .set({ status: 'queued', leaseOwner: null, leaseExpiresAt: null })
      .where(
        and(
          eq(runs.id, input.runId),
          eq(runs.status, 'running'),
          eq(runs.leaseOwner, claimed.leaseOwner),
          eq(runs.attempt, claimed.attempt),
        ),
      );
    throw error;
  }

  if (
    activeStep &&
    (result.stopReason === 'turn_budget' || result.stopReason === 'session_budget')
  ) {
    await abortActiveResearchStep({
      runId: input.runId,
      leaseOwner: claimed.leaseOwner,
      attempt: claimed.attempt,
      state: activeStep,
      db,
      now: new Date(now()),
    });
    activeStep = null;
  }

  let finalState = result.state;
  if (result.stopReason === 'session_budget') {
    finalState = {
      ...result.state,
      report: renderResearchReport(result.state, { partialReason: 'session_budget' }),
    };
    await db
      .update(runs)
      .set({
        status: 'expired',
        plan: finalState,
        cursor: finalState.cursor,
        endedAt: new Date(now()),
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(runs.id, input.runId),
          eq(runs.leaseOwner, claimed.leaseOwner),
          eq(runs.attempt, claimed.attempt),
        ),
      );
  } else if (result.stopReason === 'unit_budget') {
    finalState = {
      ...result.state,
      report: renderResearchReport(result.state, { partialReason: 'unit_budget' }),
    };
    await db
      .update(runs)
      .set({ plan: finalState, cursor: finalState.cursor, endedAt: new Date(now()) })
      .where(
        and(
          eq(runs.id, input.runId),
          eq(runs.status, 'budget_exhausted'),
          eq(runs.attempt, claimed.attempt),
        ),
      );
  } else if (result.hasMore) {
    await db
      .update(runs)
      .set({ status: 'queued', leaseOwner: null, leaseExpiresAt: null })
      .where(
        and(
          eq(runs.id, input.runId),
          eq(runs.status, 'running'),
          eq(runs.leaseOwner, claimed.leaseOwner),
          eq(runs.attempt, claimed.attempt),
        ),
      );
  }

  const latest = await getResearchRun(input.runId, db);
  return {
    ...result,
    state: latest?.state ?? finalState,
    runId: input.runId,
    status: latest?.status ?? 'missing',
    attempt: claimed.attempt,
  };
}
