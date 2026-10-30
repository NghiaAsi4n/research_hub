import { describe, expect, it, vi } from 'vitest';
import { initResearch, type ResearchDeps, runResearch, runResearchStep } from './research';

function deps(overrides: Partial<ResearchDeps> = {}): ResearchDeps {
  return {
    plan: vi.fn(async () => ['thuê nhà', 'đặt cọc']),
    search: vi.fn(async (query: string) => [
      { url: `https://example.com/${query}`, title: `Kết quả ${query}` },
      { url: 'https://example.com/chung', title: 'Kết quả chung' },
    ]),
    read: vi.fn(async (source) => ({ excerpt: `Trích đoạn ${source.url}` })),
    reflect: vi.fn(async () => ({ notes: ['đủ bằng chứng'], queries: [], done: true })),
    synthesize: vi.fn(
      async (state) => `Báo cáo cho "${state.question}" với ${state.sources.length} nguồn`,
    ),
    ...overrides,
  };
}

describe('runResearchStep', () => {
  it('đi qua năm bước theo đúng thứ tự', async () => {
    const d = deps();
    const seen: string[] = [];
    let state = initResearch('Thủ tục thuê nhà');

    for (let index = 0; index < 20; index += 1) {
      seen.push(state.step);
      const result = await runResearchStep(state, d);
      state = result.state;
      if (result.done) break;
    }

    expect(seen).toEqual(['plan', 'search', 'read', 'read', 'read', 'reflect', 'synthesize']);
    expect(state.report).toContain('3 nguồn');
  });

  it('lập kế hoạch và tìm kiếm chỉ một lần cho mỗi bước', async () => {
    const d = deps();
    const first = await runResearchStep(initResearch('hỏi'), d);
    expect(d.plan).toHaveBeenCalledTimes(1);
    expect(first.state.pendingQueries).toEqual(['thuê nhà', 'đặt cọc']);

    const second = await runResearchStep(first.state, d);
    expect(d.search).toHaveBeenCalledTimes(2);
    expect(second.state.sources).toHaveLength(3);
  });

  it('đọc một nguồn mỗi lượt và bỏ qua nguồn trùng', async () => {
    const d = deps();
    let state = initResearch('hỏi');
    state = (await runResearchStep(state, d)).state;
    state = (await runResearchStep(state, d)).state;

    const afterFirstRead = (await runResearchStep(state, d)).state;
    expect(d.read).toHaveBeenCalledTimes(1);
    expect(afterFirstRead.sources.filter((source) => source.read)).toHaveLength(1);
  });

  it('reflect quay lại search khi còn thiếu bằng chứng', async () => {
    const d = deps({
      reflect: vi.fn(async () => ({
        notes: ['cần thêm'],
        queries: ['phụ lục hợp đồng'],
        done: false,
      })),
    });
    let state = initResearch('hỏi');
    for (let guard = 0; guard < 20 && state.step !== 'reflect'; guard += 1) {
      state = (await runResearchStep(state, d)).state;
    }
    state = (await runResearchStep(state, d)).state;

    expect(state.step).toBe('search');
    expect(state.pendingQueries).toContain('phụ lục hợp đồng');
  });
});

describe('runResearch', () => {
  it('chạy tới báo cáo và dừng', async () => {
    const state = await runResearch(initResearch('hỏi'), deps());

    expect(state.report).toContain('3 nguồn');
    expect(state.steps).toBeGreaterThan(0);
  });

  it('tôn trọng trần số bước', async () => {
    const state = await runResearch(initResearch('hỏi'), deps(), { maxSteps: 2 });

    expect(state.report).toBeNull();
    expect(state.steps).toBe(2);
  });
});
