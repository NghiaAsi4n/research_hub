import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBriefing } from './briefing-run';
import type { Db } from './db/client';

const pg = new PGlite();
const db = drizzle(pg) as unknown as Db;

const env = {
  SLACK_WEBHOOK_URL: 'https://hooks.slack.test/x',
  RESEND_API_KEY: 'resend-test',
  BRIEFING_EMAIL_TO: 'me@example.com',
  BRIEFING_FROM_EMAIL: 'onboarding@resend.dev',
  BRIEFING_SYMBOLS: 'VNINDEX',
  BRIEFING_RSS_URLS: '',
  BRIEFING_MAX_ITEMS: '5',
  HN_MIN_SCORE: '10',
  SSI_CONSUMER_ID: undefined,
  SSI_CONSUMER_SECRET: undefined,
} as unknown as ReturnType<typeof import('./env').getEnv>;

beforeAll(async () => {
  await pg.exec(`
    create table notifications (
      id uuid primary key default gen_random_uuid(),
      kind text not null,
      channel text not null,
      payload_digest text not null,
      payload jsonb,
      read_at timestamptz,
      sent_at timestamptz not null default now()
    );
    create unique index notifications_kind_channel_digest_idx
      on notifications (kind, channel, payload_digest);
  `);
});

beforeEach(async () => {
  await pg.exec('truncate notifications');
});

afterAll(() => pg.close());

const now = new Date('2026-11-02T10:00:00Z');
const fetchImpl = vi.fn(async (url: string) => {
  if (url.endsWith('topstories.json')) return Response.json([1]);
  if (url.includes('/item/1.json')) {
    return Response.json({
      title: 'Next.js 17 ra mắt',
      url: 'https://example.com/next',
      time: Math.floor(now.getTime() / 1000),
      score: 120,
    });
  }
  return new Response('not found', { status: 404 });
});

describe('lượt bản tin', () => {
  it('gửi đủ kênh lần đầu và không gửi trùng lần hai', async () => {
    const sendSlack = vi.fn(async (_text: string) => true);
    const sendEmail = vi.fn(async (_message: { subject: string; text: string }) => true);

    const first = await runBriefing({
      now,
      db,
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sendSlack,
      sendEmail,
    });
    expect(first.techCount).toBe(1);
    expect(first.marketStatus).toBe('skipped_missing_credentials');
    expect(first.channels).toEqual({ inApp: 'sent', slack: 'sent', email: 'sent' });

    const second = await runBriefing({
      now,
      db,
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sendSlack,
      sendEmail,
    });
    expect(second.channels).toEqual({ inApp: 'duplicate', slack: 'duplicate', email: 'duplicate' });
    expect(sendSlack).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const slackText = sendSlack.mock.calls[0]?.[0] ?? '';
    expect(slackText).toContain('Bản tin hằng ngày — 02/11/2026');
    expect(slackText).toContain('Không phải khuyến nghị đầu tư');
  });

  it('thiếu cấu hình Slack/email thì bỏ qua, vẫn ghi chuông trong app', async () => {
    const summary = await runBriefing({
      now,
      db,
      env: {
        ...env,
        SLACK_WEBHOOK_URL: undefined,
        RESEND_API_KEY: undefined,
      } as unknown as typeof env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(summary.channels).toEqual({ inApp: 'sent', slack: 'skipped', email: 'skipped' });
  });

  it('không có khoá SSI thì không gọi mạng tới SSI', async () => {
    const summary = await runBriefing({
      now,
      db,
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(summary.marketStatus).toBe('skipped_missing_credentials');
    expect(summary.marketCount).toBe(0);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('ssi.com.vn'))).toBe(false);
  });
});
