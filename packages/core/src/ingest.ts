import { createHash } from 'node:crypto';

// Danh tính nguồn cho `/api/ingest` (Giai đoạn 1, T3).
//
// Mọi phép suy ra "nguồn này là nguồn nào" nằm ở đây, để route chỉ còn việc gọi store và ký URL.
// Nhờ vậy test chạy được mà không cần mạng, cơ sở dữ liệu hay Object Storage.

export const MAX_FILENAME_LENGTH = 200;
export const CONTENT_TYPE_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

export type IngestTarget =
  | { kind: 'url'; value: string; domain: string }
  | { kind: 'file'; value: string; filename: string; contentType: string };

export type ParsedIngest =
  | { ok: true; target: IngestTarget }
  | { ok: false; error: string; detail: string };

// Tham số chỉ phục vụ đo đếm của bên thứ ba: bỏ trước khi so trùng để dán lại cùng một bài viết
// kèm `?utm_source=...` vẫn ra đúng một nguồn.
const TRACKING_PARAMS = /^(utm_.+|fbclid|gclid|dclid|mc_cid|mc_eid|igshid|ref_src|spm)$/;

export function normalizeSourceUrl(raw: string): { value: string; domain: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) {
      parsed.searchParams.delete(key);
    }
  }
  // Bỏ dấu `/` cuối: `example.com/bai` và `example.com/bai/` là cùng một bài.
  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }
  return { value: parsed.toString(), domain: parsed.hostname };
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// UUID suy từ hash, dùng làm khoá chính của `sources`: bảng chưa có chỉ mục duy nhất trên
// (kind, url) nên cùng một nguồn phải tự ra cùng một id thì lần ingest sau mới ghi đè thay vì
// thêm dòng mới. Bit phiên bản/biến thể giữ đúng chuẩn RFC 4122 để giá trị vẫn là UUID hợp lệ.
export function deterministicUuid(value: string): string {
  const chars = [...sha256Hex(value).slice(0, 32)];
  const version = chars[12];
  const variant = chars[16];
  if (version === undefined || variant === undefined) {
    throw new Error('sha256Hex trả về chuỗi ngắn hơn 32 ký tự');
  }
  chars[12] = '5';
  chars[16] = ((Number.parseInt(variant, 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

// `contentHash` chỉ có khi client tự băm file: lúc đó giá trị nguồn phân biệt được hai file trùng
// tên. Không có thì tên file là thứ duy nhất để nhận diện nguồn.
export function fileSourceValue(filename: string, contentHash?: string): string {
  return contentHash === undefined || contentHash === ''
    ? `file://${filename}`
    : `file://${filename}#sha256:${contentHash.toLowerCase()}`;
}

export function parseIngestRequest(body: unknown): ParsedIngest {
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const sourceUrl = typeof input.sourceUrl === 'string' ? input.sourceUrl.trim() : '';
  if (sourceUrl !== '') {
    const normalized = normalizeSourceUrl(sourceUrl);
    if (normalized === null) {
      return {
        ok: false,
        error: 'invalid_source_url',
        detail: 'sourceUrl phải là địa chỉ http(s) hợp lệ',
      };
    }
    return { ok: true, target: { kind: 'url', ...normalized } };
  }

  const filename = typeof input.filename === 'string' ? input.filename.trim() : '';
  const contentType = typeof input.contentType === 'string' ? input.contentType.trim() : '';
  const contentHash = typeof input.contentHash === 'string' ? input.contentHash.trim() : '';

  if (filename === '' || filename.length > MAX_FILENAME_LENGTH) {
    return {
      ok: false,
      error: 'invalid_filename',
      detail: 'cần sourceUrl, hoặc filename tối đa 200 ký tự',
    };
  }
  if (!CONTENT_TYPE_PATTERN.test(contentType)) {
    return {
      ok: false,
      error: 'invalid_content_type',
      detail: 'contentType phải theo dạng application/pdf',
    };
  }
  if (contentHash !== '' && !/^[0-9a-f]{64}$/i.test(contentHash)) {
    return {
      ok: false,
      error: 'invalid_content_hash',
      detail: 'contentHash phải là sha256 dạng hex, 64 ký tự',
    };
  }

  return {
    ok: true,
    target: {
      kind: 'file',
      value: fileSourceValue(filename, contentHash),
      filename,
      contentType,
    },
  };
}

function sourceFingerprint(target: IngestTarget): string {
  return `${target.kind}|${target.value}`;
}

// Khoá chính của dòng `sources` và bộ ba khoá chống trùng của một lần ingest.
export function sourceId(target: IngestTarget): string {
  return deterministicUuid(sourceFingerprint(target));
}

// T3 dùng hash của chính nguồn làm giá trị chống trùng tạm; T9 thay bằng hash nội dung sau khi
// làm sạch rồi gộp các nguồn trỏ về cùng một tài liệu.
export function documentHash(target: IngestTarget): string {
  return sha256Hex(sourceFingerprint(target));
}

// Cùng một tài liệu thì cùng một việc: `jobs.idem_key` là duy nhất, nên lần ingest sau ghi vào
// đúng dòng cũ thay vì tạo việc mới.
export function ingestIdemKey(target: IngestTarget): string {
  return `ingest:${documentHash(target)}`;
}

// Tiêu đề tạm lấy từ nguồn; fetcher (T4/T5) thay bằng tiêu đề thật của tài liệu.
export function titleHint(target: IngestTarget): string {
  return (target.kind === 'file' ? target.filename : target.value).slice(0, 300);
}

// Phần tên object gợi nhớ nguồn gốc; `buildStorageKey` lo chống trùng và làm sạch ký tự.
export function sourceObjectName(target: IngestTarget): string {
  if (target.kind === 'file') {
    return target.filename;
  }
  const segments = new URL(target.value).pathname.split('/').filter((part) => part !== '');
  return segments.at(-1) ?? 'article';
}
