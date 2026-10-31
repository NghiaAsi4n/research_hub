import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { Document as DocxDocument, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Xuất tài liệu ra Markdown, PDF, DOCX (Giai đoạn 4, T4).
//
// PDF nhúng Noto Sans để tiếng Việt có đủ dấu. Nếu không đọc được file font (ví dụ gói server
// không mang asset), bản PDF quay về Helvetica và bỏ dấu thay vì làm hỏng request.

export type ExportFormat = 'md' | 'pdf' | 'docx';

export type ExportDocument = {
  title: string;
  markdown: string;
};

type Block = { kind: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'quote'; text: string };

const FONT_CANDIDATES = [
  () => fileURLToPath(new URL('./assets/fonts/NotoSans-Regular.ttf', import.meta.url)),
  () => join(process.cwd(), 'packages/core/src/assets/fonts/NotoSans-Regular.ttf'),
  () => join(process.cwd(), '../../packages/core/src/assets/fonts/NotoSans-Regular.ttf'),
];

function loadFontBytes(): Uint8Array | null {
  for (const candidate of FONT_CANDIDATES) {
    try {
      // Asset được khai báo trong outputFileTracingIncludes của apps/web, không để Turbopack
      // quét cả project chỉ vì đường dẫn đọc font.
      const bytes = readFileSync(/* turbopackIgnore: true */ candidate());
      if (bytes.byteLength > 0) return bytes;
    } catch {
      // thử đường dẫn kế tiếp
    }
  }
  return null;
}

export function stripDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function exportFilename(title: string, format: ExportFormat): string {
  const slug = stripDiacritics(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug === '' ? 'tai-lieu' : slug}.${format}`;
}

export function contentTypeFor(format: ExportFormat): string {
  if (format === 'pdf') return 'application/pdf';
  if (format === 'docx')
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'text/markdown; charset=utf-8';
}

function inlineText(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .trim();
}

export function markdownBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let fenced = false;
  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (raw.trimStart().startsWith('```')) {
      fenced = !fenced;
      continue;
    }
    const line = raw.trim();
    if (line === '') continue;
    if (fenced) {
      blocks.push({ kind: 'p', text: raw });
      continue;
    }
    if (line.startsWith('#### ')) {
      blocks.push({ kind: 'h3', text: inlineText(line.slice(5)) });
    } else if (line.startsWith('### ')) {
      blocks.push({ kind: 'h3', text: inlineText(line.slice(4)) });
    } else if (line.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: inlineText(line.slice(3)) });
    } else if (line.startsWith('# ')) {
      blocks.push({ kind: 'h1', text: inlineText(line.slice(2)) });
    } else if (/^[-*]\s+/.test(line)) {
      blocks.push({ kind: 'li', text: inlineText(line.replace(/^[-*]\s+/, '')) });
    } else if (/^\d+[.)]\s+/.test(line)) {
      blocks.push({ kind: 'li', text: inlineText(line) });
    } else if (line.startsWith('> ')) {
      blocks.push({ kind: 'quote', text: inlineText(line.slice(2)) });
    } else if (line.startsWith('|')) {
      blocks.push({ kind: 'p', text: line });
    } else {
      blocks.push({ kind: 'p', text: inlineText(line) });
    }
  }
  return blocks;
}

export function renderMarkdown(document: ExportDocument): string {
  const body = document.markdown.trim();
  if (body.startsWith('#')) return `${body}\n`;
  return `# ${document.title}\n\n${body}\n`;
}

export async function renderDocx(document: ExportDocument): Promise<Uint8Array> {
  const blocks = markdownBlocks(renderMarkdown(document));
  const paragraphs = blocks.map((block) => {
    if (block.kind === 'h1') {
      return new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_1 });
    }
    if (block.kind === 'h2') {
      return new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_2 });
    }
    if (block.kind === 'h3') {
      return new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_3 });
    }
    if (block.kind === 'li') {
      return new Paragraph({ text: block.text, bullet: { level: 0 } });
    }
    if (block.kind === 'quote') {
      return new Paragraph({
        children: [new TextRun({ text: block.text, italics: true })],
        indent: { left: 360 },
      });
    }
    return new Paragraph({ children: [new TextRun(block.text)] });
  });

  const docx = new DocxDocument({
    sections: [{ properties: {}, children: paragraphs }],
    creator: 'Research Hub',
    title: document.title,
  });
  const buffer = await Packer.toBuffer(docx);
  return new Uint8Array(buffer);
}

const PAGE = { width: 595, height: 842 };
const MARGIN = 48;

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/u).filter((word) => word !== '');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current !== '') lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    // Một "từ" dài hơn dòng (URL dài): cắt theo ký tự.
    let chunk = '';
    for (const char of word) {
      if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    current = chunk;
  }
  if (current !== '') lines.push(current);
  return lines;
}

export async function renderPdf(document: ExportDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(document.title);
  const fontBytes = loadFontBytes();
  pdf.registerFontkit(fontkit);

  const embedded = fontBytes === null ? null : await pdf.embedFont(fontBytes, { subset: true });
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const fallback = embedded === null ? await pdf.embedFont(StandardFonts.Helvetica) : null;

  const blocks = markdownBlocks(renderMarkdown(document)).map((block) =>
    fallback === null ? block : { ...block, text: stripDiacritics(block.text) },
  );
  const fonts = embedded === null ? (fallback as NonNullable<typeof fallback>) : embedded;
  const sizes: Record<Block['kind'], number> = { h1: 18, h2: 15, h3: 13, p: 11, li: 11, quote: 11 };
  const lineHeight = (size: number) => size * 1.45;

  let current = page;
  let cursorY = PAGE.height - MARGIN;

  const push = (text: string, size: number, indent: number) => {
    const maxWidth = PAGE.width - MARGIN * 2 - indent;
    for (const line of wrapText(text, fonts, size, maxWidth)) {
      if (cursorY - lineHeight(size) < MARGIN) {
        current = pdf.addPage([PAGE.width, PAGE.height]);
        cursorY = PAGE.height - MARGIN;
      }
      cursorY -= lineHeight(size);
      current.drawText(line, {
        x: MARGIN + indent,
        y: cursorY,
        size,
        font: fonts,
        color: rgb(0.09, 0.1, 0.11),
      });
    }
  };

  for (const block of blocks) {
    const size = sizes[block.kind];
    if (block.kind === 'h1' || block.kind === 'h2' || block.kind === 'h3') {
      cursorY -= 6;
      push(block.text, size, 0);
      cursorY -= 4;
    } else if (block.kind === 'li') {
      push(`• ${block.text}`, size, 12);
    } else if (block.kind === 'quote') {
      push(block.text, size, 24);
    } else {
      push(block.text, size, 0);
      cursorY -= 3;
    }
  }

  const bytes = await pdf.save();
  return new Uint8Array(bytes);
}

export async function renderDocument(
  document: ExportDocument,
  format: ExportFormat,
): Promise<Uint8Array> {
  if (format === 'pdf') return renderPdf(document);
  if (format === 'docx') return renderDocx(document);
  return new TextEncoder().encode(renderMarkdown(document));
}
