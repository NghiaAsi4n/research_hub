// Orchestrator deep research (Giai đoạn 3, T1).
//
// Máy trạng thái năm bước: plan → search → read → reflect → synthesize. Mỗi bước là một hàm nhận
// trạng thái và trả trạng thái kế tiếp, không sửa tại chỗ, nên chạy lại một bước ở tầng logic là
// idempotent. Phần ghi DB (`runs`, `run_steps`) và hàng đợi gọi model do T2–T4 lo.

export type ResearchStep = 'plan' | 'search' | 'read' | 'reflect' | 'synthesize';

export type ResearchSource = {
  url: string;
  title: string;
  read: boolean;
  excerpt?: string;
};

export type ResearchState = {
  question: string;
  step: ResearchStep;
  plan: string[];
  pendingQueries: string[];
  sources: ResearchSource[];
  notes: string[];
  report: string | null;
  steps: number;
};

export type ResearchDeps = {
  plan: (question: string) => Promise<string[]>;
  search: (query: string) => Promise<{ url: string; title: string }[]>;
  read: (source: ResearchSource) => Promise<{ excerpt: string }>;
  reflect: (state: ResearchState) => Promise<{ notes: string[]; queries: string[]; done: boolean }>;
  synthesize: (state: ResearchState) => Promise<string>;
};

export const QUERIES_PER_STEP = 2;
export const DEFAULT_MAX_STEPS = 60;

export function initResearch(question: string): ResearchState {
  return {
    question,
    step: 'plan',
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
): Promise<{ state: ResearchState; done: boolean }> {
  const steps = state.steps + 1;

  if (state.step === 'plan') {
    const plan = await deps.plan(state.question);
    return {
      state: { ...state, steps, plan, pendingQueries: plan, step: 'search' },
      done: false,
    };
  }

  if (state.step === 'search') {
    const batch = state.pendingQueries.slice(0, QUERIES_PER_STEP);
    const found: { url: string; title: string }[] = [];
    for (const query of batch) {
      found.push(...(await deps.search(query)));
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
      },
      done: false,
    };
  }

  if (state.step === 'read') {
    const index = state.sources.findIndex((source) => !source.read);
    if (index === -1) {
      return { state: { ...state, steps, step: 'reflect' }, done: false };
    }
    const target = state.sources[index] as ResearchSource;
    const { excerpt } = await deps.read(target);
    const sources = state.sources.map((source, position) =>
      position === index ? { ...source, read: true, excerpt } : source,
    );
    const stillUnread = sources.some((source) => !source.read);
    // Mỗi lượt chỉ đọc một nguồn để không vượt trần thời gian của function.
    return {
      state: { ...state, steps, sources, step: stillUnread ? 'read' : 'reflect' },
      done: false,
    };
  }

  if (state.step === 'reflect') {
    const reflection = await deps.reflect(state);
    const notes = [...state.notes, ...reflection.notes];
    if (reflection.done || reflection.queries.length === 0) {
      return { state: { ...state, steps, notes, step: 'synthesize' }, done: false };
    }
    return {
      state: {
        ...state,
        steps,
        notes,
        pendingQueries: [...state.pendingQueries, ...reflection.queries],
        step: 'search',
      },
      done: false,
    };
  }

  const report = await deps.synthesize(state);
  return { state: { ...state, steps, report, step: 'synthesize' }, done: true };
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
