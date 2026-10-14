import type { PdfLine, PdfPageText } from './pdf-text';

// Ghép các trang PDF đã trích thành Markdown sạch (Giai đoạn 1, T5).
//
// Dấu phân cách trang là chú thích HTML `<!-- page: N -->`: người đọc không thấy nó trong bản dựng,
// còn viewer (T8) đọc bản Markdown nguồn để nhảy đúng trang.
//
// PDF không mang ngữ nghĩa tiêu đề, nên mục được nhận ra theo cỡ chữ: cỡ lớn hơn hẳn cỡ thân bài và
// dòng đủ ngắn. Ngưỡng lấy theo tỉ lệ nên không phụ thuộc đơn vị của từng file.

export const PAGE_MARKER_PREFIX = '<!-- page:';

export function pageMarker(pageNumber: number): string {
  return `${PAGE_MARKER_PREFIX} ${pageNumber} -->`;
}

const HEADING_MAX_CHARS = 120;
const HEADING_MIN_RATIO = 1.15;
const SECTION_RATIO = 1.25;
const TITLE_RATIO = 1.5;
// Khoảng trống dọc giữa hai dòng lớn hơn ngần này lần cỡ chữ thân bài thì coi là hết đoạn.
const PARAGRAPH_GAP_RATIO = 1.6;

// Cỡ chữ thân bài: trung vị có trọng số theo số ký tự, để một hai dòng tiêu đề không kéo lệch.
export function bodyFontSize(pages: PdfPageText[]): number {
  const weighted: Array<{ size: number; weight: number }> = [];
  let total = 0;
  for (const page of pages) {
    for (const line of page.lines) {
      if (line.text.length === 0) {
        continue;
      }
      weighted.push({ size: line.fontSize, weight: line.text.length });
      total += line.text.length;
    }
  }
  if (weighted.length === 0) {
    return 0;
  }

  weighted.sort((left, right) => left.size - right.size);
  let seen = 0;
  for (const entry of weighted) {
    seen += entry.weight;
    if (seen >= total / 2) {
      return entry.size;
    }
  }
  return weighted[weighted.length - 1]?.size ?? 0;
}

export function isHeadingLine(line: PdfLine, bodySize: number): boolean {
  if (bodySize <= 0 || line.text.length === 0 || line.text.length > HEADING_MAX_CHARS) {
    return false;
  }
  return line.fontSize >= bodySize * HEADING_MIN_RATIO;
}

function headingLevel(line: PdfLine, bodySize: number): string {
  if (line.fontSize >= bodySize * TITLE_RATIO) {
    return '##';
  }
  if (line.fontSize >= bodySize * SECTION_RATIO) {
    return '###';
  }
  return '####';
}

export function markdownFromPdfPages(pages: PdfPageText[]): string {
  const bodySize = bodyFontSize(pages);
  const blocks: string[] = [];

  for (const page of pages) {
    blocks.push(pageMarker(page.pageNumber));

    let paragraph: string[] = [];
    let previous: PdfLine | null = null;

    const flush = (): void => {
      if (paragraph.length > 0) {
        blocks.push(paragraph.join(' '));
        paragraph = [];
      }
    };

    for (const line of page.lines) {
      if (isHeadingLine(line, bodySize)) {
        flush();
        blocks.push(`${headingLevel(line, bodySize)} ${line.text}`);
        previous = line;
        continue;
      }

      if (
        previous !== null &&
        bodySize > 0 &&
        previous.y - line.y > bodySize * PARAGRAPH_GAP_RATIO
      ) {
        flush();
      }

      paragraph.push(line.text);
      previous = line;
    }

    flush();
  }

  return blocks.join('\n\n').trim();
}
