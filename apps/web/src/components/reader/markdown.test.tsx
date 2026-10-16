import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import { describe, expect, it } from 'vitest';
import { readerMarkup } from './markdown';

const render = (
  markdown: string,
  highlights: { startOffset: number; endOffset: number; quote: string }[] = [],
) =>
  renderToStaticMarkup(
    createElement(
      Markdown,
      {
        skipHtml: true,
        rehypePlugins: [[readerMarkup, { highlights }]],
      },
      markdown,
    ),
  );

describe('reader Markdown', () => {
  it('assigns stable distinct heading IDs and preserves PDF page anchors', () => {
    const html = render('## Same\n\n## Same\n\n<!-- page: 3 -->\n\nText');
    expect(html).toContain('id="section-0"');
    expect(html).toContain('id="section-9"');
    expect(html).toContain('id="page-3"');
  });
  it('restores a selection crossing inline formatting and ignores a stale quote', () => {
    const html = render('One **two** three', [
      { startOffset: 4, endOffset: 13, quote: 'two three' },
    ]);
    expect(html).toContain('<strong><mark>two</mark></strong><mark> three</mark>');
    expect(
      render('Different text', [{ startOffset: 0, endOffset: 3, quote: 'One' }]),
    ).not.toContain('<mark>');
  });
  it('does not execute raw HTML or javascript links', () => {
    const html = render('<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('javascript:');
  });
});
