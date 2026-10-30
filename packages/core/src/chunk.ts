// Chia bản Markdown sạch thành chunk theo cấu trúc tài liệu (Giai đoạn 2, T1).
//
// Ranh giới chunk bám khối cấu trúc (tiêu đề, đoạn, danh sách, bảng, khối mã) thay vì cắt theo số
// ký tự, để đoạn nguồn trong trích dẫn vẫn trọn câu. Marker `<!-- page: N -->` do T5 chèn vào bản
// Markdown của PDF là ranh giới cứng: chunk không vượt trang để trích dẫn quy được về đúng trang.
// Phần chồng lấn chỉ lấy từ câu cuối của chunk trước và chỉ áp dụng trong cùng một trang.

export type ChunkOptions = {
  // Trần ký tự của một chunk. Chunk có thể ngắn hơn khi khối kế tiếp làm vượt trần.
  maxChars?: number;
  // Trần ký tự của phần chồng lấn lấy từ chunk trước.
  overlapChars?: number;
};

export type TextChunk = {
  ord: number;
  text: string;
  tokenCount: number;
};

export const DEFAULT_MAX_CHARS = 1200;
export const DEFAULT_OVERLAP_CHARS = 200;

type BlockKind = 'heading' | 'page' | 'code' | 'text';
type Block = { kind: BlockKind; text: string };
type Packed = { text: string; page: number | null };

const PAGE_MARKER = /^<!--\s*page:\s*(\d+)\s*-->$/;
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^#{1,6}\s/;

function normalize(markdown: string): string {
  return markdown.replace(/\r\n?/g, '\n');
}

// Tách khối theo cấu trúc; khối mã và bảng giữ nguyên để không cắt vụn cú pháp.
function splitBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let fence: string | null = null;

  const flush = (kind: BlockKind = 'text') => {
    const text = buffer.join('\n').trim();
    if (text) blocks.push({ kind, text });
    buffer = [];
  };

  for (const line of normalize(markdown).split('\n')) {
    const trimmed = line.trim();
    const fenceMatch = FENCE.exec(line);

    if (fence !== null) {
      buffer.push(line);
      if (fenceMatch && fenceMatch[1] === fence) {
        flush('code');
        fence = null;
      }
      continue;
    }

    if (fenceMatch) {
      flush();
      fence = fenceMatch[1] ?? '```';
      buffer.push(line);
      continue;
    }

    if (PAGE_MARKER.test(trimmed)) {
      flush();
      blocks.push({ kind: 'page', text: trimmed });
      continue;
    }

    if (HEADING.test(line)) {
      flush();
      blocks.push({ kind: 'heading', text: line.trimEnd() });
      continue;
    }

    if (trimmed === '') {
      flush();
      continue;
    }

    buffer.push(line);
  }

  flush(fence === null ? 'text' : 'code');
  return blocks;
}

// Cắt khối quá dài: khối mã theo dòng, khối văn bản theo câu, câu quá dài thì theo từ.
function splitOversized(block: Block, maxChars: number): Block[] {
  if (block.text.length <= maxChars) return [block];

  if (block.kind === 'code') {
    const pieces: Block[] = [];
    let current: string[] = [];
    let length = 0;
    for (const line of block.text.split('\n')) {
      if (current.length > 0 && length + line.length + 1 > maxChars) {
        pieces.push({ kind: 'code', text: current.join('\n') });
        current = [];
        length = 0;
      }
      current.push(line);
      length += line.length + 1;
    }
    if (current.length > 0) pieces.push({ kind: 'code', text: current.join('\n') });
    return pieces;
  }

  const pieces: Block[] = [];
  let current = '';
  const push = () => {
    const text = current.trim();
    if (text) pieces.push({ kind: block.kind, text });
    current = '';
  };

  for (const sentence of splitSentences(block.text)) {
    if (sentence.length > maxChars) {
      push();
      for (const piece of splitByWords(sentence, maxChars)) {
        pieces.push({ kind: block.kind, text: piece });
      }
      continue;
    }
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChars) {
      push();
      current = sentence;
      continue;
    }
    current = candidate;
  }
  push();
  return pieces;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…:])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function splitByWords(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      pieces.push(current);
      current = word;
      continue;
    }
    current = candidate;
  }
  if (current) pieces.push(current);
  return pieces;
}

function pageOf(text: string): number | null {
  const match = PAGE_MARKER.exec(text.split('\n')[0]?.trim() ?? '');
  return match ? Number(match[1]) : null;
}

function pack(blocks: Block[], maxChars: number): Packed[] {
  const packed: Packed[] = [];
  let page: number | null = null;
  let current: Packed = { text: '', page };
  packed.push(current);

  const close = () => {
    current = { text: '', page };
    packed.push(current);
  };
  const append = (text: string) => {
    current.text = current.text ? `${current.text}\n\n${text}` : text;
  };

  for (const block of blocks) {
    if (block.kind === 'page') {
      // Marker mở trang mới: đóng chunk hiện tại rồi bắt đầu chunk mới bằng chính marker.
      page = pageOf(block.text) ?? page;
      if (current.text) {
        close();
      } else {
        current.page = page;
      }
      append(block.text);
      continue;
    }

    if (current.text && current.text.length + block.text.length + 2 > maxChars) close();
    append(block.text);
  }

  return packed.filter((item) => item.text.length > 0);
}

// Lấy phần đuôi theo câu, không cắt giữa từ, và không kéo theo marker trang.
function tailForOverlap(text: string, overlapChars: number): string {
  if (overlapChars <= 0) return '';
  const body = PAGE_MARKER.test(text.split('\n')[0]?.trim() ?? '')
    ? text.slice(text.indexOf('\n') + 1)
    : text;
  const sentences = splitSentences(body);
  const picked: string[] = [];
  let length = 0;
  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    const sentence = sentences[index] as string;
    if (length + sentence.length > overlapChars && picked.length > 0) break;
    picked.unshift(sentence);
    length += sentence.length + 1;
    if (length >= overlapChars) break;
  }
  return picked.join(' ');
}

export function estimateTokens(text: string): number {
  // Ước lượng cho tiếng Việt: khoảng 1,3 token mỗi từ. Chỉ dùng để lập kế hoạch batch embedding,
  // không dùng để cắt chunk.
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

export function chunkMarkdown(markdown: string, options: ChunkOptions = {}): TextChunk[] {
  const maxChars = Math.max(50, options.maxChars ?? DEFAULT_MAX_CHARS);
  const overlapChars = Math.max(0, options.overlapChars ?? DEFAULT_OVERLAP_CHARS);

  const blocks = splitBlocks(markdown).flatMap((block) => splitOversized(block, maxChars));
  const packed = pack(blocks, maxChars);

  return packed.map((item, index) => {
    const previous = index > 0 ? packed[index - 1] : undefined;
    const overlap =
      previous && overlapChars > 0 && previous.page === item.page
        ? tailForOverlap(previous.text, overlapChars)
        : '';
    const text =
      overlap && !item.text.startsWith(overlap) ? `${overlap}\n\n${item.text}` : item.text;
    return { ord: index, text, tokenCount: estimateTokens(text) };
  });
}
