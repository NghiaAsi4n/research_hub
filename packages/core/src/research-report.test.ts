import { describe, expect, it } from 'vitest';
import { initResearch } from './research';
import { renderResearchReport } from './research-report';

function stateWithSources(count: number) {
  const state = initResearch('research question');
  state.sources = Array.from({ length: count }, (_, index) => ({
    url: `https://example.com/source-${index + 1}`,
    title: `Source ${index + 1}`,
    read: true,
    excerpt: `Evidence ${index + 1}`,
  }));
  state.notes = ['Finding from the reviewed evidence.'];
  return state;
}

describe('renderResearchReport', () => {
  it('separates the conclusion, evidence, and clickable source list', () => {
    const report = renderResearchReport(stateWithSources(5), {
      conclusion: 'Five sources support this conclusion.',
    });

    expect(report).toContain('## Kết luận');
    expect(report).toContain('## Bằng chứng');
    expect(report).toContain('## Nguồn');
    expect(report).toContain('[Source 5](https://example.com/source-5)');
    expect(report).toContain('Evidence 1');
  });

  it('refuses to draw a conclusion when fewer than five sources were read', () => {
    const report = renderResearchReport(stateWithSources(4), {
      conclusion: 'Unsupported guess.',
    });

    expect(report).toContain('Không đủ bằng chứng');
    expect(report).not.toContain('Unsupported guess.');
  });

  it('includes a reason when returning a partial report', () => {
    const report = renderResearchReport(stateWithSources(2), {
      partialReason: 'unit_budget',
    });

    expect(report).toContain('Báo cáo một phần');
    expect(report).toContain('đã chạm hạn mức');
    expect(report).toContain('Không đủ bằng chứng');
  });

  it('does not render a source link with an unsafe protocol', () => {
    const state = stateWithSources(5);
    state.sources = state.sources.map((source, index) =>
      index === 0 ? { ...source, url: 'javascript:alert(1)' } : source,
    );

    const report = renderResearchReport(state, { conclusion: 'Supported.' });

    expect(report).not.toContain('[Source 1](javascript:');
    expect(report).toContain('Source 1');
  });

  it('strips raw HTML and images from the model conclusion', () => {
    const report = renderResearchReport(stateWithSources(5), {
      conclusion: 'Safe text <script>alert(1)</script> ![tracking](https://evil.test/pixel)',
    });

    expect(report).toContain('Safe text');
    expect(report).not.toContain('<script>');
    expect(report).not.toContain('![tracking]');
    expect(report).not.toContain('evil.test');
  });
});
