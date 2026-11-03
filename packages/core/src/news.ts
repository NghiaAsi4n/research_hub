// Nguồn tin công nghệ (Giai đoạn 6, T2): Hacker News API và RSS/Atom.
//
// Không thêm thư viện XML: các nguồn dùng RSS 2.0 hoặc Atom với cấu trúc cố định, parser dưới đây
// đọc hai dạng đó và trả cùng một kiểu NewsItem. Bài chỉ được lưu khi thật sự đưa vào kho.

export type NewsItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: Date | null;
  score: number | null;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function first(xml: string, pattern: RegExp): string | null {
  const match = pattern.exec(xml);
  return match?.[1] ? decodeXml(match[1]) : null;
}

function atomLink(xml: string): string | null {
  const alternate = /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(xml);
  if (alternate?.[1]) return alternate[1];
  const any = /<link[^>]*href=["']([^"']+)["']/i.exec(xml);
  return any?.[1] ?? null;
}

export function parseFeed(xml: string, source: string): NewsItem[] {
  const blocks = [
    ...(xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []),
  ];

  return blocks
    .map((block): NewsItem | null => {
      const title = first(block, /<title[^>]*>([\s\S]*?)<\/title>/i);
      const link = first(block, /<link[^>]*>([\s\S]*?)<\/link>/i) ?? atomLink(block);
      const published =
        first(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ??
        first(block, /<published[^>]*>([\s\S]*?)<\/published>/i) ??
        first(block, /<updated[^>]*>([\s\S]*?)<\/updated>/i);
      if (!title || !link) return null;
      const date = published ? new Date(published) : null;
      return {
        title,
        url: link,
        source,
        publishedAt: date !== null && !Number.isNaN(date.getTime()) ? date : null,
        score: null,
      } satisfies NewsItem;
    })
    .filter((item): item is NewsItem => item !== null);
}

export async function fetchFeed(input: {
  url: string;
  source?: string;
  fetchImpl?: FetchLike;
}): Promise<NewsItem[]> {
  const response = await (input.fetchImpl ?? fetch)(input.url, {
    headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`RSS HTTP ${response.status}`);
  const xml = await response.text();
  return parseFeed(xml, input.source ?? new URL(input.url).hostname.replace(/^www\./, ''));
}

export async function fetchHackerNews(
  input: { limit?: number; minScore?: number; fetchImpl?: FetchLike } = {},
): Promise<NewsItem[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const limit = input.limit ?? 10;
  const response = await fetchImpl('https://hacker-news.firebaseio.com/v0/topstories.json', {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HN HTTP ${response.status}`);
  const ids = (await response.json()) as unknown;
  if (!Array.isArray(ids)) return [];

  const picked = ids.slice(0, Math.max(limit * 3, 10));
  const items = await Promise.all(
    picked.map(async (id) => {
      const itemResponse = await fetchImpl(
        `https://hacker-news.firebaseio.com/v0/item/${String(id)}.json`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!itemResponse.ok) return null;
      const item = (await itemResponse.json()) as {
        title?: unknown;
        url?: unknown;
        time?: unknown;
        score?: unknown;
      };
      if (typeof item.title !== 'string' || typeof item.url !== 'string') return null;
      const score = typeof item.score === 'number' ? item.score : null;
      if (input.minScore !== undefined && (score ?? 0) < input.minScore) return null;
      return {
        title: item.title,
        url: item.url,
        source: 'Hacker News',
        publishedAt: typeof item.time === 'number' ? new Date(item.time * 1000) : null,
        score,
      } satisfies NewsItem;
    }),
  );

  return items.filter((item): item is NewsItem => item !== null).slice(0, limit);
}

export function selectNews(input: {
  items: NewsItem[];
  keywords?: string[];
  since?: Date | null;
  limit?: number;
}): NewsItem[] {
  const keywords = (input.keywords ?? [])
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword !== '');
  const seen = new Set<string>();
  return input.items
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      if (input.since && item.publishedAt && item.publishedAt < input.since) return false;
      if (keywords.length === 0) return true;
      const haystack = item.title.toLowerCase();
      return keywords.some((keyword) => haystack.includes(keyword));
    })
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, input.limit ?? 10);
}
