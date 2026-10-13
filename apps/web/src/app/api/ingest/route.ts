import { buildStorageKey, presignUpload, UPLOAD_URL_TTL_SECONDS } from '@research-hub/core/storage';
import { guardRequest } from '@/lib/guard';

// Giai đoạn 0: cấp URL ký sẵn để thử upload thẳng từ trình duyệt lên Object Storage — file
// không đi qua function vì Vercel Hobby giới hạn body 4.5 MB. Việc tạo `documents`/`jobs` rồi
// xử lý nội dung thuộc Giai đoạn 1, plan mục 8.
const MAX_FILENAME_LENGTH = 200;
const DEFAULT_KIND = 'documents';
const CONTENT_TYPE_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

type UploadRequest = {
  filename?: unknown;
  contentType?: unknown;
  kind?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as UploadRequest;
  const requestedKind = typeof body.kind === 'string' ? body.kind.trim() : '';
  const kind = requestedKind === '' ? DEFAULT_KIND : requestedKind;

  // Guard dùng chung: phiên hợp lệ, loại nguồn trong allowlist, rate limit theo người dùng.
  const guard = await guardRequest({ route: 'ingest', sourceKind: kind });
  if (!guard.ok) {
    return guard.response;
  }

  const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
  const contentType = typeof body.contentType === 'string' ? body.contentType.trim() : '';

  if (filename === '' || filename.length > MAX_FILENAME_LENGTH) {
    return Response.json(
      { error: 'invalid_filename', detail: 'filename bắt buộc, tối đa 200 ký tự' },
      { status: 400 },
    );
  }

  if (!CONTENT_TYPE_PATTERN.test(contentType)) {
    return Response.json(
      { error: 'invalid_content_type', detail: 'contentType phải theo dạng application/pdf' },
      { status: 400 },
    );
  }

  const key = buildStorageKey(kind, filename);
  let uploadUrl: string;
  try {
    uploadUrl = await presignUpload(key, contentType);
  } catch (error) {
    // Thiếu credential Object Storage (chạy `neon link`) — tách khỏi lỗi nhập liệu bằng 503.
    return Response.json(
      {
        error: 'storage_unavailable',
        detail: error instanceof Error ? error.message : 'không ký được URL',
      },
      { status: 503 },
    );
  }

  return Response.json({
    key,
    uploadUrl,
    method: 'PUT',
    contentType,
    expiresIn: UPLOAD_URL_TTL_SECONDS,
  });
}
