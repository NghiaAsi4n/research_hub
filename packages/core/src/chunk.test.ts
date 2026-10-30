import { describe, expect, it } from 'vitest';
import { chunkMarkdown, estimateTokens } from './chunk';

const article = [
  '# Hợp đồng thuê nhà',
  '',
  'Bên thuê có nghĩa vụ thanh toán tiền thuê đúng hạn theo thỏa thuận. Tiền thuê được trả mỗi tháng một lần.',
  '',
  'Bên cho thuê bàn giao nhà ở kèm trang thiết bị đã thỏa thuận. Biên bản bàn giao là căn cứ xác định hiện trạng.',
  '',
  '## Điều khoản chấm dứt',
  '',
  'Hợp đồng chấm dứt khi hết thời hạn thuê hoặc khi một bên vi phạm nghĩa vụ cơ bản.',
  '',
  'Mọi sửa đổi phải được lập thành văn bản và có chữ ký của cả hai bên.',
].join('\n');

describe('chunkMarkdown', () => {
  it('keeps every structured block inside exactly one chunk', () => {
    const items = chunkMarkdown(article, { maxChars: 400, overlapChars: 0 });
    const blocks = [
      'Bên thuê có nghĩa vụ thanh toán tiền thuê đúng hạn theo thỏa thuận.',
      'Bên cho thuê bàn giao nhà ở kèm trang thiết bị đã thỏa thuận.',
      'Hợp đồng chấm dứt khi hết thời hạn thuê hoặc khi một bên vi phạm nghĩa vụ cơ bản.',
      'Mọi sửa đổi phải được lập thành văn bản và có chữ ký của cả hai bên.',
    ];
    for (const block of blocks) {
      const holders = items.filter((item) => item.text.includes(block));
      expect(holders).toHaveLength(1);
    }
  });

  it('merges blocks up to the size limit instead of cutting mid-sentence', () => {
    const items = chunkMarkdown(article, { maxChars: 400, overlapChars: 0 });
    expect(items.length).toBeGreaterThan(1);
    for (const item of items) {
      expect(item.text.length).toBeLessThanOrEqual(400);
      expect(item.text.trim()).toBe(item.text);
      // Khối văn bản kết thúc bằng dấu câu, không cắt giữa câu.
      expect(item.text === item.text.trimEnd()).toBe(true);
      expect(/(^#|^<!-- page|\.$)/.test(item.text.split('\n').at(-1) ?? '')).toBe(true);
    }
  });

  it('splits a single oversized paragraph on sentence boundaries', () => {
    const sentence = 'Bên thuê thanh toán đủ tiền thuê theo kỳ hạn đã ghi trong hợp đồng.';
    const long = Array.from({ length: 20 }, () => sentence).join(' ');
    const items = chunkMarkdown(long, { maxChars: 300, overlapChars: 0 });
    expect(items.length).toBeGreaterThan(1);
    for (const item of items) {
      expect(item.text.length).toBeLessThanOrEqual(300);
      expect(item.text.endsWith('.')).toBe(true);
      expect(item.text.startsWith('Bên thuê')).toBe(true);
    }
  });

  it('treats a PDF page marker as a hard boundary and keeps it at the start of the chunk', () => {
    const markdown = [
      '<!-- page: 1 -->',
      'Trang một nói về phạm vi hợp đồng.',
      '',
      '<!-- page: 2 -->',
      'Trang hai nói về giá trị hợp đồng.',
    ].join('\n');
    const items = chunkMarkdown(markdown, { maxChars: 500, overlapChars: 200 });
    expect(items).toHaveLength(2);
    expect(items[0]?.text.startsWith('<!-- page: 1 -->')).toBe(true);
    expect(items[1]?.text.startsWith('<!-- page: 2 -->')).toBe(true);
    expect(items[0]?.text).not.toContain('page: 2');
  });

  it('repeats the previous tail as overlap inside the same page only', () => {
    const markdown = [
      'Câu thứ nhất về thời hạn thuê. Câu thứ hai về tiền đặt cọc.',
      '',
      'Câu thứ ba về trách nhiệm sửa chữa.',
    ].join('\n');
    const items = chunkMarkdown(markdown, { maxChars: 70, overlapChars: 40 });
    expect(items).toHaveLength(2);
    expect(items[0]?.text).toBe('Câu thứ nhất về thời hạn thuê. Câu thứ hai về tiền đặt cọc.');
    expect(items[1]?.text.startsWith('Câu thứ hai về tiền đặt cọc.')).toBe(true);
  });

  it('does not carry overlap across a page boundary', () => {
    const markdown = [
      '<!-- page: 1 -->',
      'Câu thứ ba về trách nhiệm sửa chữa.',
      '',
      '<!-- page: 2 -->',
      'Câu thứ tư về chấm dứt hợp đồng.',
    ].join('\n');
    const items = chunkMarkdown(markdown, { maxChars: 200, overlapChars: 80 });
    expect(items).toHaveLength(2);
    expect(items[1]?.text.startsWith('<!-- page: 2 -->')).toBe(true);
    expect(items[1]?.text).not.toContain('trách nhiệm sửa chữa');
  });

  it('is deterministic and numbers chunks from zero', () => {
    const first = chunkMarkdown(article, { maxChars: 350, overlapChars: 80 });
    const second = chunkMarkdown(article, { maxChars: 350, overlapChars: 80 });
    expect(first).toEqual(second);
    expect(first.map((item) => item.ord)).toEqual(first.map((_, index) => index));
  });

  it('returns nothing for empty input', () => {
    expect(chunkMarkdown('   \n\n  ')).toEqual([]);
  });

  it('estimates tokens above zero for text', () => {
    expect(estimateTokens('một hai ba')).toBeGreaterThan(0);
    expect(estimateTokens('')).toBe(0);
  });
});
