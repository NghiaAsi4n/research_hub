import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  contentTypeFor,
  exportFilename,
  markdownBlocks,
  renderDocument,
  renderMarkdown,
  stripDiacritics,
} from './export-doc';

const sample = {
  title: 'Luật Doanh nghiệp — ghi chú',
  markdown: [
    '## Kết luận',
    '',
    'Doanh nghiệp tư nhân do **một cá nhân** làm chủ.',
    '',
    '- Điều 183: [nguồn](https://vbpl.vn/a)',
    '- Vốn đầu tư',
    '',
    '> Trích đoạn nguyên văn.',
  ].join('\n'),
};

describe('xuất tài liệu', () => {
  it('tạo tên file không dấu và đúng đuôi', () => {
    expect(exportFilename('Luật Doanh nghiệp — ghi chú', 'pdf')).toBe(
      'luat-doanh-nghiep-ghi-chu.pdf',
    );
    expect(exportFilename('!!!', 'docx')).toBe('tai-lieu.docx');
    expect(stripDiacritics('Điều kiện')).toBe('Dieu kien');
  });

  it('bóc Markdown thành khối có cấu trúc', () => {
    const blocks = markdownBlocks(sample.markdown);
    expect(blocks.slice(0, 2)).toEqual([
      { kind: 'h2', text: 'Kết luận' },
      { kind: 'p', text: 'Doanh nghiệp tư nhân do một cá nhân làm chủ.' },
    ]);
    expect(blocks).toContainEqual({ kind: 'li', text: 'Điều 183: nguồn (https://vbpl.vn/a)' });
    expect(blocks).toContainEqual({ kind: 'quote', text: 'Trích đoạn nguyên văn.' });
  });

  it('Markdown có tiêu đề khi thân bài chưa có', () => {
    expect(renderMarkdown({ title: 'A', markdown: 'nội dung' })).toBe('# A\n\nnội dung\n');
    expect(renderMarkdown({ title: 'A', markdown: '## Có sẵn' })).toBe('## Có sẵn\n');
    expect(contentTypeFor('pdf')).toBe('application/pdf');
  });

  it('PDF mở lại được, có tiêu đề và nhiều trang khi nội dung dài', async () => {
    const bytes = await renderDocument(
      { ...sample, markdown: `${sample.markdown}\n\n${'Dòng dài để ngắt trang. '.repeat(400)}` },
      'pdf',
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getTitle()).toBe(sample.title);
  });

  it('DOCX là gói zip có document.xml', async () => {
    const bytes = await renderDocument(sample, 'docx');
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 2))).toBe('PK');
    const raw = new TextDecoder('latin1').decode(bytes);
    expect(raw).toContain('word/document.xml');
  });
});
