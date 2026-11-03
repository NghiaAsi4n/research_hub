import { and, eq } from 'drizzle-orm';
import {
  briefingDigest,
  buildBriefing,
  marketRowsFromSeries,
  renderEmailBriefing,
  renderSlackBriefing,
} from './briefing';
import { type Db, getDb } from './db/client';
import { notifications } from './db/schema';
import { getEnv } from './env';
import {
  fetchSsiDailyIndex,
  fetchSsiDailyStockPrice,
  fetchSsiToken,
  type QuoteInput,
} from './market';
import { fetchFeed, fetchHackerNews, type NewsItem, selectNews } from './news';
import { createQuotesStore } from './quote-store';

// Một lượt bản tin hằng ngày (Giai đoạn 6, T4): thu tin, lấy giá, render, gửi Slack/email và
// ghi sổ `notifications` để chạy lại trong ngày không gửi trùng.

const INDEX_SYMBOLS = new Set(['VNINDEX', 'HNXINDEX', 'UPCOMINDEX']);

export type ChannelStatus = 'sent' | 'duplicate' | 'skipped' | 'failed';

export type BriefingRunSummary = {
  date: string;
  techCount: number;
  marketCount: number;
  marketStatus: 'ok' | 'skipped_missing_credentials' | 'failed';
  newsErrors: string[];
  channels: { inApp: ChannelStatus; slack: ChannelStatus; email: ChannelStatus };
};

export type BriefingConfig = {
  symbols: string[];
  rssUrls: string[];
  maxItems: number;
  hnMinScore: number;
  ssiConsumerId?: string;
  ssiConsumerSecret?: string;
};

export function briefingConfigFromEnv(env: ReturnType<typeof getEnv>): BriefingConfig {
  const list = (value: string | undefined) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '');
  const symbols = list(env.BRIEFING_SYMBOLS);
  return {
    symbols: symbols.length > 0 ? symbols : ['VNINDEX', 'HNXINDEX'],
    rssUrls: list(env.BRIEFING_RSS_URLS),
    maxItems: Number.parseInt(env.BRIEFING_MAX_ITEMS ?? '10', 10) || 10,
    hnMinScore: Number.parseInt(env.HN_MIN_SCORE ?? '50', 10) || 0,
    ssiConsumerId: env.SSI_CONSUMER_ID,
    ssiConsumerSecret: env.SSI_CONSUMER_SECRET,
  };
}

async function claim(
  db: Db,
  channel: string,
  digest: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const rows = await db
    .insert(notifications)
    .values({ kind: 'briefing', channel, payloadDigest: digest, payload })
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return rows.length > 0;
}

async function release(db: Db, channel: string, digest: string): Promise<void> {
  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.kind, 'briefing'),
        eq(notifications.channel, channel),
        eq(notifications.payloadDigest, digest),
      ),
    );
}

export async function runBriefing(
  input: {
    now?: Date;
    db?: Db;
    fetchImpl?: typeof fetch;
    sendSlack?: (text: string) => Promise<boolean>;
    sendEmail?: (message: { subject: string; text: string }) => Promise<boolean>;
    config?: Partial<BriefingConfig>;
    env?: ReturnType<typeof getEnv>;
  } = {},
): Promise<BriefingRunSummary> {
  const env = input.env ?? getEnv();
  const now = input.now ?? new Date();
  const cfg = { ...briefingConfigFromEnv(env), ...input.config };
  const db = input.db ?? getDb();
  const newsErrors: string[] = [];

  const collected: NewsItem[] = [];
  try {
    collected.push(
      ...(await fetchHackerNews({
        limit: cfg.maxItems * 2,
        minScore: cfg.hnMinScore,
        fetchImpl: input.fetchImpl,
      })),
    );
  } catch {
    newsErrors.push('hacker_news');
  }
  for (const url of cfg.rssUrls) {
    try {
      collected.push(...(await fetchFeed({ url, fetchImpl: input.fetchImpl })));
    } catch {
      try {
        newsErrors.push(new URL(url).hostname);
      } catch {
        newsErrors.push(url);
      }
    }
  }

  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tech = selectNews({ items: collected, since, limit: cfg.maxItems });

  let marketStatus: BriefingRunSummary['marketStatus'] = 'skipped_missing_credentials';
  let marketRows: ReturnType<typeof marketRowsFromSeries> = [];
  if (cfg.ssiConsumerId && cfg.ssiConsumerSecret) {
    marketStatus = 'failed';
    try {
      const token = await fetchSsiToken({
        consumerId: cfg.ssiConsumerId,
        consumerSecret: cfg.ssiConsumerSecret,
        fetchImpl: input.fetchImpl,
      });
      const fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const quotes: QuoteInput[] = [];
      for (const symbol of cfg.symbols) {
        const rows = INDEX_SYMBOLS.has(symbol)
          ? await fetchSsiDailyIndex({
              token,
              indexId: symbol,
              fromDate,
              toDate: now,
              fetchImpl: input.fetchImpl,
            })
          : await fetchSsiDailyStockPrice({
              token,
              symbol,
              fromDate,
              toDate: now,
              fetchImpl: input.fetchImpl,
            });
        quotes.push(...rows);
      }

      const store = createQuotesStore(db);
      await store.upsertMany(quotes);
      marketRows = marketRowsFromSeries(await store.latestSeries(cfg.symbols), cfg.symbols);
      marketStatus = 'ok';
    } catch {
      marketStatus = 'failed';
    }
  }

  const briefing = buildBriefing({ date: now, tech, market: marketRows });
  const digest = briefingDigest(briefing);
  const slackText = renderSlackBriefing(briefing);
  const email = renderEmailBriefing(briefing);
  const summaryPayload = {
    date: briefing.date.toISOString(),
    techCount: tech.length,
    marketCount: marketRows.length,
    marketStatus,
  };

  const channels: BriefingRunSummary['channels'] = {
    inApp: (await claim(db, 'in_app', digest, summaryPayload)) ? 'sent' : 'duplicate',
    slack: 'skipped',
    email: 'skipped',
  };

  if (
    env.SLACK_WEBHOOK_URL &&
    input.sendSlack &&
    (await claim(db, 'slack', digest, summaryPayload))
  ) {
    const ok = await input.sendSlack(slackText);
    if (ok) {
      channels.slack = 'sent';
    } else {
      await release(db, 'slack', digest);
      channels.slack = 'failed';
    }
  } else if (env.SLACK_WEBHOOK_URL) {
    channels.slack = 'duplicate';
  }

  if (
    env.RESEND_API_KEY &&
    env.BRIEFING_EMAIL_TO &&
    input.sendEmail &&
    (await claim(db, 'email', digest, summaryPayload))
  ) {
    const ok = await input.sendEmail(email);
    if (ok) {
      channels.email = 'sent';
    } else {
      await release(db, 'email', digest);
      channels.email = 'failed';
    }
  } else if (env.RESEND_API_KEY && env.BRIEFING_EMAIL_TO) {
    channels.email = 'duplicate';
  }

  return {
    date: briefing.date.toISOString(),
    techCount: tech.length,
    marketCount: marketRows.length,
    marketStatus,
    newsErrors,
    channels,
  };
}
