import { describe, expect, it, vi } from 'vitest';
import { fetchHackerNews, parseFeed, selectNews } from './news';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title><![CDATA[Next.js 17 ra mắt]]></title><link>https://example.com/next</link>
<pubDate>Mon, 02 Nov 2026 08:00:00 GMT</pubDate></item>
<item><title>Tin &amp; pháp lý</title><link>https://example.com/law</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>React 20</title><link rel="alternate" href="https://example.com/react"/>
<updated>2026-11-02T09:00:00Z</updated></entry></feed>`;

describe('đọc nguồn tin', () => {
  it('đọc RSS 2.0 và Atom, giải mã thực thể', () => {
    const rss = parseFeed(RSS, 'Example');
    expect(rss).toHaveLength(2);
    expect(rss[0]).toMatchObject({ title: 'Next.js 17 ra mắt', source: 'Example' });
    expect(rss[1]?.title).toBe('Tin & pháp lý');

    const atom = parseFeed(ATOM, 'Atom');
    expect(atom[0]).toMatchObject({ title: 'React 20', url: 'https://example.com/react' });
  });

  it('lọc theo từ khoá, bỏ trùng và giới hạn số mục', () => {
    const items = [
      ...parseFeed(RSS, 'Example'),
      ...parseFeed(RSS, 'Example'),
      {
        title: 'Giá vàng hôm nay',
        url: 'https://example.com/gold',
        source: 'Example',
        publishedAt: null,
        score: null,
      },
    ];

    expect(selectNews({ items, keywords: ['next'], limit: 5 })).toHaveLength(1);
    expect(selectNews({ items, keywords: [], limit: 2 })).toHaveLength(2);
  });

  it('lấy Hacker News và lọc điểm tối thiểu', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('topstories.json')) return Response.json([1, 2]);
      const id = url.match(/item\/(\d+)\.json/)?.[1];
      return Response.json({
        id: Number(id),
        title: `Story ${id}`,
        url: `https://news.example/${id}`,
        time: 1_700_000_000,
        score: id === '1' ? 200 : 5,
      });
    });

    const items = await fetchHackerNews({ limit: 5, minScore: 100, fetchImpl });
    expect(items).toEqual([
      {
        title: 'Story 1',
        url: 'https://news.example/1',
        source: 'Hacker News',
        publishedAt: new Date(1_700_000_000 * 1000),
        score: 200,
      },
    ]);
  });
});
