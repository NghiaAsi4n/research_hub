import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Trích lớp văn bản của PDF bằng pdf.js (Giai đoạn 1, T5).
//
// Chỉ đọc văn bản, không render trang: plan mục 8 chỉ cần nội dung đọc được nên không cần canvas.
// Trong Node, pdf.js tự chạy ở chế độ worker giả nên không phải cấu hình `workerSrc`.
//
// PDF scan không có lớp văn bản trả về `unreadable` kèm lý do, không ghi Markdown rỗng. File hỏng
// hoặc có mật khẩu là `error`: đó là lỗi của bản tải lên chứ không phải nguồn không đọc được.
//
// Hàm nhận `Uint8Array` vì pdf.js có thể nhận quyền sở hữu buffer; gọi ở đây luôn truyền bản sao.

export const MIN_PDF_TEXT_CHARS = 40;

// Hai dòng cùng một hàng chữ trong PDF thường lệch nhau vài phần nghìn đơn vị; lấy nửa chiều cao
// chữ làm ngưỡng tách dòng là cách pdf.js khuyến nghị khi ghép dòng từ các mảnh văn bản.
const LINE_Y_TOLERANCE_RATIO = 0.5;
const LINE_Y_TOLERANCE_MIN = 2;

export type PdfLine = {
  text: string;
  fontSize: number;
  y: number;
};

export type PdfPageText = {
  pageNumber: number;
  lines: PdfLine[];
};

export type PdfTextResult =
  | { kind: 'ok'; title?: string; pageCount: number; pages: PdfPageText[]; textLength: number }
  | {
      kind: 'unreadable';
      reason: 'no_text_layer' | 'empty_document';
      pageCount: number;
      textLength: number;
    }
  | {
      kind: 'error';
      reason: 'invalid_pdf' | 'password_protected' | 'extract_failed';
      detail: string;
    };

type TextItemLike = {
  str: string;
  transform: number[];
  height: number;
  hasEOL?: boolean;
};

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// Ghép các mảnh văn bản thành dòng: mảnh cùng hàng thì nối vào dòng đang mở, mảnh lệch hàng hoặc có
// cờ xuống dòng thì đóng dòng. Mảnh rỗng chỉ là dấu xuống dòng nên bị bỏ qua.
export function linesFromTextItems(items: TextItemLike[]): PdfLine[] {
  const lines: PdfLine[] = [];
  let parts: string[] = [];
  let size = 0;
  let y = 0;

  const flush = (): void => {
    const text = normalize(parts.join(' '));
    if (text !== '') {
      lines.push({ text, fontSize: size, y });
    }
    parts = [];
    size = 0;
  };

  for (const item of items) {
    const text = normalize(item.str);
    if (text === '') {
      continue;
    }

    const itemY = item.transform[5] ?? 0;
    const itemSize = item.height > 0 ? item.height : size;
    const tolerance = Math.max(LINE_Y_TOLERANCE_MIN, itemSize * LINE_Y_TOLERANCE_RATIO);

    if (parts.length > 0 && Math.abs(itemY - y) > tolerance) {
      flush();
    }

    if (parts.length === 0) {
      y = itemY;
      size = itemSize;
    } else {
      size = Math.max(size, itemSize);
    }
    parts.push(text);

    if (item.hasEOL === true) {
      flush();
    }
  }

  flush();
  return lines;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readTitle(document: {
  getMetadata(): Promise<unknown>;
}): Promise<string | undefined> {
  try {
    const metadata = (await document.getMetadata()) as { info?: { Title?: unknown } };
    const title = metadata.info?.Title;
    if (typeof title === 'string' && title.trim() !== '') {
      return title.trim();
    }
  } catch {
    // Metadata hỏng không đáng làm hỏng việc trích văn bản.
  }
  return undefined;
}

export async function extractPdfText(
  bytes: Uint8Array,
  range?: { startPage: number; maxPages: number; deadlineAt?: number },
): Promise<PdfTextResult> {
  const task = getDocument({
    data: bytes,
    // Không tải font hay ảnh: chỉ đọc lớp văn bản, mà function không có DOM để dựng font.
    disableFontFace: true,
    useSystemFonts: false,
    // 0 = chỉ log lỗi: pdf.js cảnh báo thiếu `standardFontDataUrl` khi không render, không hữu ích ở đây.
    verbosity: 0,
  });

  let document: Awaited<typeof task.promise>;
  try {
    document = await task.promise;
  } catch (error) {
    await task.destroy().catch(() => undefined);
    const name = error instanceof Error ? error.name : '';
    if (name === 'PasswordException') {
      return { kind: 'error', reason: 'password_protected', detail: errorDetail(error) };
    }
    return { kind: 'error', reason: 'invalid_pdf', detail: errorDetail(error) };
  }

  try {
    const pages: PdfPageText[] = [];
    const startPage = range?.startPage ?? 1;
    const endPage =
      range === undefined
        ? document.numPages
        : Math.min(document.numPages, startPage + range.maxPages - 1);
    if (
      !Number.isInteger(startPage) ||
      startPage < 1 ||
      !Number.isInteger(endPage) ||
      (document.numPages > 0 && startPage > document.numPages)
    ) {
      return { kind: 'error', reason: 'extract_failed', detail: 'Invalid PDF page range' };
    }
    for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: TextItemLike[] = [];
      for (const raw of content.items) {
        if ('str' in raw) {
          items.push({
            str: raw.str as string,
            transform: raw.transform as number[],
            height: raw.height as number,
            hasEOL: raw.hasEOL as boolean | undefined,
          });
        }
      }
      pages.push({ pageNumber, lines: linesFromTextItems(items) });
      if (range?.deadlineAt !== undefined && Date.now() >= range.deadlineAt) break;
    }

    const pageCount = document.numPages;
    const textLength = pages.reduce(
      (total, page) => total + page.lines.reduce((sum, line) => sum + line.text.length, 0),
      0,
    );
    const title = await readTitle(document);

    if (pageCount === 0) {
      return { kind: 'unreadable', reason: 'empty_document', pageCount, textLength };
    }
    if (range === undefined && textLength < MIN_PDF_TEXT_CHARS) {
      // Bản scan: trang có ảnh nhưng không có mảnh văn bản nào.
      return { kind: 'unreadable', reason: 'no_text_layer', pageCount, textLength };
    }

    return { kind: 'ok', title, pageCount, pages, textLength };
  } catch (error) {
    return { kind: 'error', reason: 'extract_failed', detail: errorDetail(error) };
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
