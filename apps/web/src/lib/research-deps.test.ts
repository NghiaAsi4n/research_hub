import { processOllamaQueue } from '@research-hub/core/ollama-queue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertPublicResearchUrl,
  createPinnedLookup,
  createResearchDeps,
  extractResearchText,
  isPublicResearchAddress,
  parseBingSearchResults,
  parseResearchSearchResults,
} from './research-deps';

describe('research web sources', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OLLAMA_BASE_URL;
  });

  it('parses public DuckDuckGo result links and decodes their titles', () => {
    const results = parseResearchSearchResults(
      '<a class="result__a" href="https://example.com/a?x=1&amp;y=2">A &amp; B</a>',
    );

    expect(results).toEqual([{ url: 'https://example.com/a?x=1&y=2', title: 'A & B' }]);
  });

  it('ignores non-HTTPS and malformed search result destinations', () => {
    const results = parseResearchSearchResults(
      '<a class="result__a" href="http://example.com">HTTP</a>' +
        '<a class="result__a" href="javascript:alert(1)">Unsafe</a>',
    );

    expect(results).toEqual([]);
  });

  it('removes active page content and extracts readable text', () => {
    const text = extractResearchText(
      '<html><script>steal()</script><style>.x{}</style><h1>Title</h1><p>Useful evidence</p></html>',
    );

    expect(text).toContain('Title');
    expect(text).toContain('Useful evidence');
    expect(text).not.toContain('steal');
    expect(text).not.toContain('.x');
  });

  it('only accepts HTTPS URLs without embedded credentials or custom ports', () => {
    expect(assertPublicResearchUrl('https://example.com/path').hostname).toBe('example.com');
    expect(() => assertPublicResearchUrl('http://example.com')).toThrow('research_url_not_allowed');
    expect(() => assertPublicResearchUrl('https://user:pass@example.com')).toThrow(
      'research_url_not_allowed',
    );
    expect(() => assertPublicResearchUrl('https://example.com:8443')).toThrow(
      'research_url_not_allowed',
    );
  });

  it('rejects IPv6 transition ranges that can encode private IPv4 addresses', () => {
    expect(isPublicResearchAddress('2002:7f00:1::1')).toBe(false);
    expect(isPublicResearchAddress('64:ff9b::7f00:1')).toBe(false);
    expect(isPublicResearchAddress('2001:0:4136:e378::1')).toBe(false);
    expect(isPublicResearchAddress('2001:db8::1')).toBe(false);
    expect(isPublicResearchAddress('fd00::1')).toBe(false);
    expect(isPublicResearchAddress('2606:4700::1111')).toBe(true);
  });

  it('pins both multi-address and single-address DNS lookup modes', () => {
    const lookup = createPinnedLookup({ address: '203.0.113.10', family: 4 });
    let multiple: Array<{ address: string; family: number }> | undefined;
    let single: { address: string; family?: number } | undefined;

    lookup('example.com', { all: true }, (_error, address) => {
      if (Array.isArray(address)) multiple = address;
    });
    lookup('example.com', {}, (_error, address, family) => {
      if (!Array.isArray(address)) single = { address, family };
    });

    expect(multiple).toEqual([{ address: '203.0.113.10', family: 4 }]);
    expect(single).toEqual({ address: '203.0.113.10', family: 4 });
  });

  it('normalizes nested JSON query strings returned by a small model', async () => {
    process.env.OLLAMA_BASE_URL = 'https://ollama.test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify(['{"thong_tin":"thủ tục doanh nghiệp"}', '{"query":"hồ sơ"}']),
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const deps = createResearchDeps({ model: 'test-model', queue: processOllamaQueue });

    await expect(deps.plan('hỏi')).resolves.toEqual(['thủ tục doanh nghiệp', 'hồ sơ']);
  });

  it('decodes Bing redirect links into public result URLs', () => {
    const destination = Buffer.from('https://example.com/legal').toString('base64url');
    const results = parseBingSearchResults(
      `<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1${destination}&ntb=1">Kết quả</a></h2></li>`,
    );

    expect(results).toEqual([{ url: 'https://example.com/legal', title: 'Kết quả' }]);
  });
});
