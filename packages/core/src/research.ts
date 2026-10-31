// Orchestrator deep research (Giai đoạn 3, T1).
//
// Máy trạng thái năm bước: plan → search → read → reflect → synthesize. Mỗi bước là một hàm nhận
// trạng thái và trả trạng thái kế tiếp, không sửa tại chỗ, nên chạy lại một bước ở tầng logic là
// idempotent. Phần ghi DB (`runs`, `run_steps`) và hàng đợi gọi model do T2–T4 lo.

export type ResearchStep = 'plan' | 'search' | 'read' | 'reflect' | 'synthesize';

export type ResearchCursor = {
  step: ResearchStep;
  position: number;
};

export type ResearchSource = {
  url: string;
  title: string;
  read: boolean;
  excerpt?: string;
};

export type ResearchUsage = { tokens: number; units: number };

export type ResearchState = {
  question: string;
  step: ResearchStep;
  cursor: ResearchCursor;
  plan: string[];
  pendingQueries: string[];
  sources: ResearchSource[];
  notes: string[];
  report: string | null;
  steps: number;
};

export type ResearchDeps = {
  plan: (question: string, signal?: AbortSignal) => Promise<string[]>;
  search: (query: string, signal?: AbortSignal) => Promise<{ url: string; title: string }[]>;
  read: (source: ResearchSource, signal?: AbortSignal) => Promise<{ excerpt: string }>;
  reflect: (
    state: ResearchState,
    signal?: AbortSignal,
  ) => Promise<{ notes: string[]; queries: string[]; done: boolean }>;
  synthesize: (state: ResearchState, signal?: AbortSignal) => Promise<string>;
  usage?: () => ResearchUsage;
};

export const QUERIES_PER_STEP = 2;
export const DEFAULT_MAX_STEPS = 60;
export const MAX_RESEARCH_TURN_MS = 240_000;

export type ResearchTurnStopReason =
  | 'turn_budget'
  | 'session_budget'
  | 'step_limit'
  | 'unit_budget';

export type ResearchTurnResult = {
  state: ResearchState;
  done: boolean;
  hasMore: boolean;
  stopReason?: ResearchTurnStopReason;
};

type PersistResearchProgress = (progress: {
  previous: ResearchState;
  state: ResearchState;
  done: boolean;
  usage: ResearchUsage;
  elapsedMs: number;
}) => Promise<{ continue?: boolean; stopReason?: ResearchTurnStopReason } | undefined>;

type ResearchTurnOptions = {
  turnBudgetMs?: number;
  sessionExpiresAt?: number;
  maxStepsPerTurn?: number;
  now?: () => number;
  beforeStep?: (
    state: ResearchState,
  ) => Promise<{ continue?: boolean; stopReason?: ResearchTurnStopReason } | undefined>;
  persist?: PersistResearchProgress;
};

export function initResearch(question: string): ResearchState {
  return {
    question,
    step: 'plan',
    cursor: { step: 'plan', position: 0 },
    plan: [],
    pendingQueries: [],
    sources: [],
    notes: [],
    report: null,
    steps: 0,
  };
}

function addSources(
  state: ResearchState,
  found: { url: string; title: string }[],
): ResearchSource[] {
  const known = new Set(state.sources.map((source) => source.url));
  const added: ResearchSource[] = [];
  for (const item of found) {
    if (known.has(item.url)) continue;
    known.add(item.url);
    added.push({ url: item.url, title: item.title, read: false });
  }
  return added;
}

export async function runResearchStep(
  state: ResearchState,
  deps: ResearchDeps,
  signal?: AbortSignal,
): Promise<{ state: ResearchState; done: boolean }> {
  const steps = state.steps + 1;

  if (state.step === 'plan') {
    const plan = await deps.plan(state.question, signal);
    return {
      state: {
        ...state,
        steps,
        plan,
        pendingQueries: plan,
        step: 'search',
        cursor: { step: 'search', position: 0 },
      },
      done: false,
    };
  }

  if (state.step === 'search') {
    const batch = state.pendingQueries.slice(0, QUERIES_PER_STEP);
    const found: { url: string; title: string }[] = [];
    for (const query of batch) {
      found.push(...(await deps.search(query, signal)));
    }
    const sources = [...state.sources, ...addSources(state, found)];
    const hasUnread = sources.some((source) => !source.read);
    return {
      state: {
        ...state,
        steps,
        sources,
        pendingQueries: state.pendingQueries.slice(batch.length),
        step: hasUnread ? 'read' : 'reflect',
        cursor: { step: hasUnread ? 'read' : 'reflect', position: 0 },
      },
      done: false,
    };
  }

  if (state.step === 'read') {
    const index = state.sources.findIndex((source) => !source.read);
    if (index === -1) {
      return {
        state: { ...state, steps, step: 'reflect', cursor: { step: 'reflect', position: 0 } },
        done: false,
      };
    }
    const target = state.sources[index] as ResearchSource;
    const { excerpt } = await deps.read(target, signal);
    const sources = state.sources.map((source, position) =>
      position === index ? { ...source, read: true, excerpt } : source,
    );
    const stillUnread = sources.some((source) => !source.read);
    // Mỗi lượt chỉ đọc một nguồn để không vượt trần thời gian của function.
    return {
      state: {
        ...state,
        steps,
        sources,
        step: stillUnread ? 'read' : 'reflect',
        cursor: stillUnread
          ? { step: 'read', position: state.cursor.position + 1 }
          : { step: 'reflect', position: 0 },
      },
      done: false,
    };
  }

  if (state.step === 'reflect') {
    const reflection = await deps.reflect(state, signal);
    const notes = [...state.notes, ...reflection.notes];
    if (reflection.done || reflection.queries.length === 0) {
      return {
        state: {
          ...state,
          steps,
          notes,
          step: 'synthesize',
          cursor: { step: 'synthesize', position: 0 },
        },
        done: false,
      };
    }
    return {
      state: {
        ...state,
        steps,
        notes,
        pendingQueries: [...state.pendingQueries, ...reflection.queries],
        step: 'search',
        cursor: { step: 'search', position: 0 },
      },
      done: false,
    };
  }

  const report = await deps.synthesize(state, signal);
  return {
    state: {
      ...state,
      steps,
      report,
      step: 'synthesize',
      cursor: { step: 'synthesize', position: state.cursor.position + 1 },
    },
    done: true,
  };
}

export async function runResearchTurn(
  state: ResearchState,
  deps: ResearchDeps,
  options: ResearchTurnOptions = {},
): Promise<ResearchTurnResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const turnBudgetMs = Math.max(
    1,
    Math.min(options.turnBudgetMs ?? MAX_RESEARCH_TURN_MS, MAX_RESEARCH_TURN_MS),
  );
  const deadline = startedAt + turnBudgetMs;
  const maxSteps = Math.max(1, Math.trunc(options.maxStepsPerTurn ?? DEFAULT_MAX_STEPS));
  let current = state;
  let completedSteps = 0;

  while (current.report === null && completedSteps < maxSteps) {
    const time = now();
    if (options.sessionExpiresAt !== undefined && time >= options.sessionExpiresAt) {
      return { state: current, done: false, hasMore: false, stopReason: 'session_budget' };
    }
    const remainingMs = deadline - time;
    if (remainingMs <= 0) {
      return { state: current, done: false, hasMore: true, stopReason: 'turn_budget' };
    }
    const budget = await options.beforeStep?.(current);
    if (budget?.continue === false) {
      return {
        state: current,
        done: false,
        hasMore: false,
        stopReason: budget.stopReason ?? 'unit_budget',
      };
    }

    const beforeUsage = deps.usage?.() ?? { tokens: 0, units: 0 };
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<{ kind: 'timeout' }>((resolve) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        resolve({ kind: 'timeout' });
      }, remainingMs);
    });

    let outcome:
      | { kind: 'timeout' }
      | { kind: 'step'; result: { state: ResearchState; done: boolean } };
    try {
      outcome = await Promise.race([
        runResearchStep(current, deps, controller.signal).then((result) => ({
          kind: 'step' as const,
          result,
        })),
        timeout,
      ]);
    } catch (error) {
      if ((error as Error).name === 'TimeoutError') {
        controller.abort();
        outcome = { kind: 'timeout' };
      } else {
        throw error;
      }
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }

    if (outcome.kind === 'timeout') {
      return { state: current, done: false, hasMore: true, stopReason: 'turn_budget' };
    }

    const result = outcome.result;
    const afterUsage = deps.usage?.() ?? beforeUsage;
    const persisted = await options.persist?.({
      previous: current,
      state: result.state,
      done: result.done,
      usage: {
        tokens: Math.max(0, afterUsage.tokens - beforeUsage.tokens),
        units: Math.max(0, afterUsage.units - beforeUsage.units),
      },
      elapsedMs: Math.max(0, now() - time),
    });
    current = result.state;
    completedSteps += 1;

    if (result.done) return { state: current, done: true, hasMore: false };
    if (persisted?.continue === false) {
      return {
        state: current,
        done: false,
        hasMore: false,
        stopReason: persisted.stopReason ?? 'unit_budget',
      };
    }
  }

  if (options.sessionExpiresAt !== undefined && now() >= options.sessionExpiresAt) {
    return { state: current, done: false, hasMore: false, stopReason: 'session_budget' };
  }
  if (now() >= deadline) {
    return { state: current, done: false, hasMore: true, stopReason: 'turn_budget' };
  }
  return { state: current, done: false, hasMore: true, stopReason: 'step_limit' };
}

export async function runResearch(
  state: ResearchState,
  deps: ResearchDeps,
  options: { maxSteps?: number } = {},
): Promise<ResearchState> {
  const maxSteps = Math.max(1, options.maxSteps ?? DEFAULT_MAX_STEPS);
  let current = state;
  while (current.report === null && current.steps < maxSteps) {
    const result = await runResearchStep(current, deps);
    current = result.state;
    if (result.done) break;
  }
  return current;
}
