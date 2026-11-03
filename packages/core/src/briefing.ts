import { createHash } from 'node:crypto';
import type { NewsItem } from './news';
import type { StoredQuote } from './quote-store';

// Dựng và render bản tin hằng ngày (Giai đoạn 6, T3), bám mẫu Slack 13.4 và email 13.5 của plan.
// Luôn có nguồn dữ liệu và dòng miễn trừ, kể cả khi thiếu một phần dữ liệu.

export type MarketRow = {
  symbol: string;
  ts: Date;
  close: number;
  changePct: number | null;
};

export type Briefing = {
  date: Date;
  tech: NewsItem[];
  market: MarketRow[];
  marketSource: string;
};

export const DISCLAIMER =
  'Chỉ dùng cho mục đích cá nhân và nghiên cứu. Không phải khuyến nghị đầu tư.';

export function briefingDateLabel(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

export function marketRowsFromSeries(series: StoredQuote[], symbols: string[]): MarketRow[] {
  const rows: MarketRow[] = [];
  for (const symbol of symbols) {
    const points = series
      .filter((quote) => quote.symbol === symbol && quote.close !== null)
      .sort((a, b) => b.ts.getTime() - a.ts.getTime());
    const latest = points[0];
    if (!latest || latest.close === null) continue;
    const previous = points[1];
    const changePct =
      previous?.close !== null && previous?.close !== undefined && previous.close !== 0
        ? ((latest.close - previous.close) / previous.close) * 100
        : null;
    rows.push({ symbol, ts: latest.ts, close: latest.close, changePct });
  }
  return rows;
}

export function buildBriefing(input: {
  date: Date;
  tech: NewsItem[];
  market: MarketRow[];
  marketSource?: string;
}): Briefing {
  return {
    date: input.date,
    tech: input.tech,
    market: input.market,
    marketSource: input.marketSource ?? 'SSI FastConnect',
  };
}

function formatPct(value: number | null): string {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function marketLine(row: MarketRow): string {
  return `• ${row.symbol} ${row.close.toFixed(2)} (${formatPct(row.changePct)})`;
}

function highlights(briefing: Briefing): string[] {
  const points: string[] = [];
  for (const item of briefing.tech.slice(0, 3)) {
    points.push(`• ${item.title} — ${item.source} <${item.url}>`);
  }
  for (const row of briefing.market) {
    if (row.changePct !== null && Math.abs(row.changePct) >= 1) {
      points.push(`• ${row.symbol} ${formatPct(row.changePct)} trong phiên gần nhất`);
    }
  }
  return points.slice(0, 5);
}

export function renderSlackBriefing(briefing: Briefing): string {
  const date = briefingDateLabel(briefing.date);
  const tech = briefing.tech;
  const lines = [
    `*Bản tin hằng ngày — ${date}*`,
    '',
    `*Tin công nghệ mới* (${tech.length} mục)`,
    ...(tech.length === 0
      ? ['• Không có tin mới trong 24 giờ.']
      : tech.map((item) => `• ${item.title} — ${item.source} <${item.url}>`)),
    '',
    `*Chứng khoán VN* (phiên ${date})`,
    ...(briefing.market.length === 0
      ? ['• Chưa có dữ liệu phiên gần nhất.']
      : briefing.market.map(marketLine)),
    '',
    '*Điểm đáng chú ý*',
    ...(highlights(briefing).length === 0 ? ['• Không có điểm nổi bật.'] : highlights(briefing)),
    '',
    `_${DISCLAIMER}_`,
  ];
  return lines.join('\n');
}

export function renderEmailBriefing(briefing: Briefing): { subject: string; text: string } {
  const date = briefingDateLabel(briefing.date);
  const tech = briefing.tech;
  const lines = [
    `Bản tin hằng ngày — ${date}`,
    '',
    `1. Tin công nghệ mới (${tech.length} mục)`,
    ...(tech.length === 0
      ? ['Không có tin mới trong 24 giờ.']
      : tech.flatMap((item) => [item.title, item.url, ''])),
    `2. Chứng khoán VN — phiên ${date}`,
    ...(briefing.market.length === 0
      ? ['Chưa có dữ liệu phiên gần nhất.']
      : briefing.market.map(marketLine).map((line) => line.replace(/^• /, ''))),
    '',
    '3. Điểm đáng chú ý',
    ...(highlights(briefing).length === 0 ? ['Không có điểm nổi bật.'] : highlights(briefing)),
    '',
    `Nguồn dữ liệu chứng khoán: ${briefing.marketSource}. ${DISCLAIMER}`,
  ];
  return {
    subject: `Bản tin hằng ngày ${date} — tin công nghệ và chứng khoán VN`,
    text: lines.join('\n'),
  };
}

export function briefingDigest(briefing: Briefing): string {
  const payload = JSON.stringify({
    date: briefingDateLabel(briefing.date),
    tech: briefing.tech.map((item) => item.url),
    market: briefing.market.map((row) => [row.symbol, row.close, row.changePct]),
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}
