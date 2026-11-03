import { describe, expect, it } from 'vitest';
import {
  briefingDateLabel,
  buildBriefing,
  DISCLAIMER,
  marketRowsFromSeries,
  renderEmailBriefing,
  renderSlackBriefing,
} from './briefing';

const tech = [
  {
    title: 'Next.js 17 ra mắt',
    url: 'https://example.com/next',
    source: 'Example',
    publishedAt: new Date('2026-11-02T08:00:00Z'),
    score: null,
  },
];

describe('bản tin hằng ngày', () => {
  it('tính phần trăm thay đổi từ hai phiên gần nhất', () => {
    const rows = marketRowsFromSeries(
      [
        { symbol: 'VNINDEX', ts: new Date('2026-11-02T00:00:00Z'), close: 1285.4, source: 'ssi' },
        { symbol: 'VNINDEX', ts: new Date('2026-11-01T00:00:00Z'), close: 1280, source: 'ssi' },
        { symbol: 'FPT', ts: new Date('2026-11-02T00:00:00Z'), close: 71, source: 'ssi' },
      ],
      ['VNINDEX', 'FPT', 'MISSING'],
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.changePct).toBeCloseTo(((1285.4 - 1280) / 1280) * 100);
    expect(rows[1]?.changePct).toBeNull();
  });

  it('Slack có ngày, số mục, mã, phần trăm và miễn trừ', () => {
    const briefing = buildBriefing({
      date: new Date('2026-11-02T10:00:00Z'),
      tech,
      market: [
        { symbol: 'VNINDEX', ts: new Date('2026-11-02T00:00:00Z'), close: 1285.4, changePct: 0.42 },
      ],
    });
    const text = renderSlackBriefing(briefing);

    expect(briefingDateLabel(briefing.date)).toBe('02/11/2026');
    expect(text).toContain('*Bản tin hằng ngày — 02/11/2026*');
    expect(text).toContain('VNINDEX 1285.40 (+0.42%)');
    expect(text).toContain('https://example.com/next');
    expect(text).toContain(DISCLAIMER);
  });

  it('email có tiêu đề và nguồn dữ liệu, chịu được phần rỗng', () => {
    const briefing = buildBriefing({
      date: new Date('2026-11-02T10:00:00Z'),
      tech: [],
      market: [],
    });
    const email = renderEmailBriefing(briefing);

    expect(email.subject).toContain('02/11/2026');
    expect(email.text).toContain('Không có tin mới');
    expect(email.text).toContain('Chưa có dữ liệu');
    expect(email.text).toContain('Nguồn dữ liệu chứng khoán: SSI FastConnect.');
    expect(email.text).toContain(DISCLAIMER);
  });
});
