import {
  documentHash,
  ingestIdemKey,
  parseIngestRequest,
  sourceId,
  sourceObjectName,
  titleHint,
} from '@research-hub/core/ingest';
import type { IngestStore } from '@research-hub/core/ingest-store';
import { buildStorageKey, presignUpload, UPLOAD_URL_TTL_SECONDS } from '@research-hub/core/storage';
import { guardRequest } from './guard';

// Hai route của đường ingest (Giai đoạn 1, T3):
//
// 1. `POST /api/ingest`      — nhận nguồn (URL hoặc file), ghi `sources`/`documents`/`jobs`, ký URL
//                              để trình duyệt đẩy file thẳng lên Object Storage.
// 2. `POST /api/ingest/done` — client báo đã đẩy xong, job rời trạng thái `awaiting_upload`.
//
// Phần quyết định nằm ở `createIngestHandler(store)` để test truyền được store giả, không cần
// Postgres lẫn Object Storage.

const DEFAULT_KIND = 'documents';
const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createIngestHandler(store: IngestStore) {
  return async function POST(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const requestedKind = typeof body.kind === 'string' ? body.kind.trim() : '';
    const kind = requestedKind === '' ? DEFAULT_KIND : requestedKind;

    const guard = await guardRequest({ route: 'ingest', sourceKind: kind });
    if (!guard.ok) {
      return guard.response;
    }

    const parsed = parseIngestRequest(body);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error, detail: parsed.detail }, { status: 400 });
    }

    const target = parsed.target;
    const hash = documentHash(target);
    const idemKey = ingestIdemKey(target);

    // Nguồn là file: object gốc nằm ở `storageKey`, fetcher đọc bản sạch ở `${storageKey}.md`
    // (quy ước khoá trong `@research-hub/core/storage`). Nguồn là URL thì chưa có file gốc, khoá
    // này chỉ để chỗ cho bản Markdown mà T4 ghi ra.
    const storageKey = buildStorageKey(kind, sourceObjectName(target));

    const source = await store.upsertSource({
      id: sourceId(target),
      kind: target.kind,
      url: target.value,
      domain: target.kind === 'url' ? target.domain : null,
    });

    // Ghi DB trước khi ký URL: nếu bước ký hỏng (thiếu credential), lần gọi sau vẫn dùng lại đúng
    // dòng này thay vì tạo thêm bản ghi mồ côi.
    const document = await store.upsertDocument({
      sourceId: source.id,
      title: titleHint(target),
      storageKey,
      hash,
    });

    const state = target.kind === 'file' ? 'awaiting_upload' : 'queued';
    const job = await store.upsertJob({
      type: 'ingest',
      idemKey,
      state,
      payload: {
        sourceId: source.id,
        documentId: document.id,
        storageKey: document.storageKey,
        url: target.kind === 'url' ? target.value : null,
        contentType: target.kind === 'file' ? target.contentType : null,
      },
    });

    const base = {
      sourceId: source.id,
      documentId: document.id,
      jobId: job.id,
      state: job.state,
    };

    if (target.kind !== 'file') {
      return Response.json(base);
    }

    let uploadUrl: string;
    try {
      // Ký theo `document.storageKey` (khoá đã nằm trong DB) chứ không theo khoá vừa sinh: gọi lại
      // cùng một file thì client phải đẩy lên đúng object mà bản ghi trỏ tới.
      uploadUrl = await presignUpload(document.storageKey, target.contentType);
    } catch (error) {
      return Response.json(
        {
          error: 'storage_unavailable',
          detail: error instanceof Error ? error.message : 'không ký được URL',
        },
        { status: 503 },
      );
    }

    return Response.json({
      ...base,
      key: document.storageKey,
      uploadUrl,
      method: 'PUT',
      contentType: target.contentType,
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    });
  };
}

export function createIngestDoneHandler(store: IngestStore) {
  return async function POST(request: Request): Promise<Response> {
    const guard = await guardRequest({ route: 'ingest' });
    if (!guard.ok) {
      return guard.response;
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
    if (!JOB_ID_PATTERN.test(jobId)) {
      return Response.json(
        { error: 'invalid_job_id', detail: 'jobId phải là UUID trả về từ /api/ingest' },
        { status: 400 },
      );
    }

    const rawBytes = body.bytes;
    if (
      rawBytes !== undefined &&
      !(typeof rawBytes === 'number' && Number.isInteger(rawBytes) && rawBytes >= 0)
    ) {
      return Response.json(
        { error: 'invalid_bytes', detail: 'bytes phải là số nguyên không âm' },
        { status: 400 },
      );
    }

    const result = await store.markUploadComplete(
      rawBytes === undefined ? { jobId } : { jobId, bytes: rawBytes },
    );
    if (result === null) {
      // Hoặc job không tồn tại, hoặc nó không còn chờ upload (đã báo xong trước đó).
      return Response.json({ error: 'job_not_awaiting_upload' }, { status: 404 });
    }

    return Response.json({ jobId: result.jobId, documentId: result.documentId, state: 'queued' });
  };
}
