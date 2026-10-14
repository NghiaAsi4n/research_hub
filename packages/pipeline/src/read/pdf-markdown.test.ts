import { describe, expect, it } from 'vitest';
import { bodyFontSize, isHeadingLine, markdownFromPdfPages, pageMarker } from './pdf-markdown';
import type { PdfPageText } from './pdf-text';

const pages: PdfPageText[] = [
  {
    pageNumber: 1,
    lines: [
      { text: 'HOP DONG MAU VE CUNG CAP DICH VU', fontSize: 20, y: 780 },
      { text: '1. Doi tuong cua hop dong', fontSize: 14, y: 712 },
      { text: 'Ben A dong y cung cap cho Ben B dich vu', fontSize: 11, y: 688 },
      { text: 'nghien cuu tai lieu phap ly theo tien do.', fontSize: 11, y: 674 },
      { text: 'Doan thu hai cach mot khoang trang.', fontSize: 11, y: 620 },
    ],
  },
  {
    pageNumber: 2,
    lines: [{ text: '2. Gia tri hop dong', fontSize: 14, y: 760 }],
  },
];

describe('bodyFontSize', () => {
  it('lấy trung vị có trọng số theo số ký tự, không bị tiêu đề kéo lệch', () => {
    expect(bodyFontSize(pages)).toBe(11);
  });

  it('trả 0 khi không có dòng nào', () => {
    expect(bodyFontSize([])).toBe(0);
  });
});

describe('isHeadingLine', () => {
  it('nhận dòng cỡ lớn và đủ ngắn, loại dòng thân bài', () => {
    expect(isHeadingLine({ text: '1. Doi tuong', fontSize: 14, y: 712 }, 11)).toBe(true);
    expect(isHeadingLine({ text: 'Ben A dong y', fontSize: 11, y: 688 }, 11)).toBe(false);
  });

  it('loại dòng cỡ lớn nhưng dài quá mức của một tiêu đề', () => {
    const long = { text: 'x'.repeat(200), fontSize: 18, y: 700 };
    expect(isHeadingLine(long, 11)).toBe(false);
  });
});

describe('markdownFromPdfPages', () => {
  it('đánh dấu trang, hạ tiêu đề theo cỡ chữ và gộp dòng thành đoạn', () => {
    const markdown = markdownFromPdfPages(pages);

    expect(markdown).toContain(pageMarker(1));
    expect(markdown).toContain(pageMarker(2));
    expect(markdown).toContain('## HOP DONG MAU VE CUNG CAP DICH VU');
    expect(markdown).toContain('### 1. Doi tuong cua hop dong');
    expect(markdown).toContain('### 2. Gia tri hop dong');
    // Hai dòng thân bài liền mạch thành một đoạn; khoảng trống dọc tách đoạn kế tiếp.
    expect(markdown).toContain(
      'Ben A dong y cung cap cho Ben B dich vu nghien cuu tai lieu phap ly theo tien do.',
    );
    expect(markdown).not.toContain('dich vu\nnghien cuu');
    // Trang 2 nằm sau trang 1 trong bản Markdown.
    expect(markdown.indexOf(pageMarker(1))).toBeLessThan(markdown.indexOf(pageMarker(2)));
  });

  it('trả chuỗi rỗng khi không có trang nào', () => {
    expect(markdownFromPdfPages([])).toBe('');
  });
});
