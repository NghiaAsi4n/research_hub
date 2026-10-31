import { describe, expect, it } from 'vitest';
import {
  assertPublicResearchUrl,
  extractResearchText,
  isPublicResearchAddress,
  parseResearchSearchResults,
} from './research-deps';

describe('research web sources', () => {
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
});
