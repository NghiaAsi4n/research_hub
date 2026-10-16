/// <reference path="../types/turndown-plugin-gfm.d.ts" />
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

// Trích nội dung chính của một trang HTML tĩnh thành Markdown (Giai đoạn 1, T4).
//
// Cố ý không nhúng trình duyệt: trang chỉ render bằng JavaScript bị trả về `unreadable` thay vì tốn
// thời gian chờ render — plan mục 8 loại Chromium khỏi function. Nhờ vậy đây là hàm thuần trên chuỗi
// HTML, test được bằng fixture mà không cần mạng.

export const MIN_ARTICLE_CHARS = 200;

export type ExtractedArticle =
  | { kind: 'ok'; title: string; markdown: string; textLength: number }
  | { kind: 'unreadable'; reason: string };

function markdownFromHtml(html: string): string {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });
  // Bảng, danh sách nhiệm vụ và gạch ngang không có trong Turndown mặc định.
  service.use(gfm);
  return service.turndown(html).trim();
}

export function articleFromHtml(html: string, options: { url?: string } = {}): ExtractedArticle {
  if (html.trim() === '') {
    return { kind: 'unreadable', reason: 'empty_html' };
  }

  // Readability phân giải liên kết tương đối qua `document.baseURI`, mà linkedom lấy giá trị đó từ
  // thẻ <base>. Thêm thẻ này để link trong bản sạch trỏ về đúng trang gốc.
  const withBase =
    options.url === undefined || /<base[\s>]/i.test(html)
      ? html
      : html.replace(/<head([^>]*)>/i, `<head$1><base href="${options.url}">`);

  const { document } = parseHTML(withBase);

  const article = new Readability(document as unknown as Document, {
    charThreshold: MIN_ARTICLE_CHARS,
  }).parse();

  if (article === null) {
    return { kind: 'unreadable', reason: 'no_article_content' };
  }

  const content = article.content;
  if (content === undefined || content === null) {
    return { kind: 'unreadable', reason: 'no_article_content' };
  }

  const textLength = (article.textContent ?? '').replace(/\s+/g, ' ').trim().length;
  if (textLength < MIN_ARTICLE_CHARS) {
    // Trang một ứng dụng: nội dung nằm trong JavaScript nên HTML nhận về gần như rỗng.
    return { kind: 'unreadable', reason: 'content_requires_javascript' };
  }

  const markdown = markdownFromHtml(content);
  if (markdown === '') {
    return { kind: 'unreadable', reason: 'empty_markdown' };
  }

  return {
    kind: 'ok',
    title: (article.title ?? options.url ?? '').trim(),
    markdown,
    textLength,
  };
}
