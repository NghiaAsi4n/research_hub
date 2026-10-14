import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractPdfText, linesFromTextItems, MIN_PDF_TEXT_CHARS } from './pdf-text';

// Fixture sinh bằng `packages/pipeline/scripts/make-pdf-fixtures.py`: một hợp đồng ba trang có tiêu
// đề cỡ lớn, mục cỡ vừa và thân bài cỡ nhỏ, cùng một PDF chỉ có ảnh (giả lập bản scan).

const contractBytes = new Uint8Array(
  readFileSync(new URL('./__fixtures__/contract-3-pages.pdf', import.meta.url)),
);
const scanBytes = new Uint8Array(
  readFileSync(new URL('./__fixtures__/scan-1-page.pdf', import.meta.url)),
);

describe('linesFromTextItems', () => {
  it('nối các mảnh cùng hàng và tách hàng theo cờ xuống dòng', () => {
    const lines = linesFromTextItems([
      { str: 'Dieu ', transform: [1, 0, 0, 1, 72, 700], height: 11 },
      { str: '1.', transform: [1, 0, 0, 1, 100, 700], height: 11, hasEOL: true },
      { str: 'Ben ', transform: [1, 0, 0, 1, 72, 686], height: 11 },
      { str: 'A', transform: [1, 0, 0, 1, 96, 686], height: 11 },
    ]);

    expect(lines.map((line) => line.text)).toEqual(['Dieu 1.', 'Ben A']);
    expect(lines[0]?.fontSize).toBeCloseTo(11, 5);
    expect(lines[0]?.y).toBe(700);
  });

  it('bỏ mảnh rỗng và gộp khoảng trắng thừa', () => {
    const lines = linesFromTextItems([
      { str: '  Hop   dong  ', transform: [1, 0, 0, 1, 72, 700], height: 12 },
      { str: '', transform: [1, 0, 0, 1, 72, 688], height: 0 },
      { str: 'moi', transform: [1, 0, 0, 1, 72, 676], height: 11 },
    ]);

    expect(lines.map((line) => line.text)).toEqual(['Hop dong', 'moi']);
  });
});

describe('extractPdfText', () => {
  it('giữ đúng thứ tự trang và cỡ chữ dùng để nhận ra tiêu đề mục', async () => {
    const result = await extractPdfText(contractBytes);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') {
      return;
    }

    expect(result.pageCount).toBe(3);
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3]);

    const firstPage = result.pages[0];
    expect(firstPage?.lines[0]?.text).toBe('HOP DONG MAU VE CUNG CAP DICH VU');
    expect(firstPage?.lines[0]?.fontSize).toBeCloseTo(20, 1);
    expect(
      firstPage?.lines.find((line) => line.text.startsWith('1. Doi tuong'))?.fontSize,
    ).toBeCloseTo(14, 1);
    expect(
      firstPage?.lines.find((line) => line.text.startsWith('Ben A dong y'))?.fontSize,
    ).toBeCloseTo(11, 1);

    // Trang cuối phải là trang chứa mục 5, không phải trang 1 lặp lại.
    const lastPage = result.pages[2];
    expect(lastPage?.lines.some((line) => line.text.startsWith('5. Xu ly tranh chap'))).toBe(true);
    expect(result.textLength).toBeGreaterThan(MIN_PDF_TEXT_CHARS);
  });

  it('bản scan không có lớp văn bản bị đánh dấu unreadable', async () => {
    const result = await extractPdfText(scanBytes);

    expect(result).toMatchObject({ kind: 'unreadable', reason: 'no_text_layer', pageCount: 1 });
  });

  it('file không phải PDF là lỗi chứ không phải nguồn không đọc được', async () => {
    const result = await extractPdfText(new TextEncoder().encode('day khong phai file pdf'));

    expect(result).toMatchObject({ kind: 'error', reason: 'invalid_pdf' });
    if (result.kind === 'error') {
      expect(result.detail.length).toBeGreaterThan(0);
    }
  });
});
