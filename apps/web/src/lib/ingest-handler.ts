import {
  documentHash,
  ingestIdemKey,
  parseIngestRequest,
  sourceId,
  sourceObjectName,
  titleHint,
} from '@research-hub/core/ingest';
import type { IngestStore } from '@research-hub/core/ingest-store';
import {
  abortMultipartUpload,
  buildStorageKey,
  completeMultipartUpload,
  createMultipartUpload,
  listMultipartParts,
  MAX_UPLOAD_BYTES,
  MULTIPART_PART_BYTES,
  MULTIPART_THRESHOLD_BYTES,
  objectSize,
  presignMultipartPart,
  presignUpload,
  UPLOAD_URL_TTL_SECONDS,
  uploadPartCount,
} from '@research-hub/core/storage';
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
    const bytes = body.bytes;
    if (
      target.kind === 'file' &&
      bytes !== undefined &&
      (typeof bytes !== 'number' || uploadPartCount(bytes) === null)
    ) {
      return Response.json({ error: 'invalid_bytes', maxBytes: MAX_UPLOAD_BYTES }, { status: 400 });
    }
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
        subject: guard.subject,
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

    if (typeof bytes === 'number' && bytes > MULTIPART_THRESHOLD_BYTES) {
      try {
        let upload = await store.getUploadJob(job.id);
        if (
          upload === null ||
          upload.subject !== guard.subject ||
          upload.state !== 'awaiting_upload'
        ) {
          return Response.json({ error: 'job_not_awaiting_upload' }, { status: 409 });
        }
        if (upload.uploadId === undefined) {
          const uploadId = await createMultipartUpload(document.storageKey, target.contentType);
          let saved: boolean;
          try {
            saved = await store.saveMultipartUpload({
              jobId: job.id,
              uploadId,
              bytes,
              partCount: uploadPartCount(bytes) as number,
            });
          } catch (error) {
            await abortMultipartUpload(document.storageKey, uploadId).catch(() => undefined);
            throw error;
          }
          if (!saved) await abortMultipartUpload(document.storageKey, uploadId);
          upload = await store.getUploadJob(job.id);
        }
        if (
          upload?.uploadId === undefined ||
          upload.partCount === undefined ||
          upload.bytes !== bytes
        ) {
          return Response.json({ error: 'upload_size_conflict' }, { status: 409 });
        }
        const parts = await Promise.all(
          Array.from({ length: upload.partCount }, async (_, index) => ({
            partNumber: index + 1,
            uploadUrl: await presignMultipartPart(
              document.storageKey,
              upload.uploadId as string,
              index + 1,
            ),
          })),
        );
        return Response.json({
          ...base,
          key: document.storageKey,
          method: 'PUT',
          multipart: true,
          partSize: MULTIPART_PART_BYTES,
          parts,
          expiresIn: UPLOAD_URL_TTL_SECONDS,
        });
      } catch {
        return Response.json({ error: 'storage_unavailable' }, { status: 503 });
      }
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

    const upload = await store.getUploadJob(jobId);
    if (upload?.uploadId !== undefined) {
      if (upload.subject !== guard.subject)
        return Response.json({ error: 'job_not_found' }, { status: 404 });
      return Response.json({ error: 'multipart_requires_parts' }, { status: 409 });
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

export function createMultipartHandler(store: IngestStore) {
  return async function POST(request: Request): Promise<Response> {
    const guard = await guardRequest({ route: 'ingest' });
    if (!guard.ok) return guard.response;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const jobId = typeof body.jobId === 'string' ? body.jobId : '';
    const upload = JOB_ID_PATTERN.test(jobId) ? await store.getUploadJob(jobId) : null;
    if (
      upload?.state !== 'awaiting_upload' ||
      upload.subject !== guard.subject ||
      !upload.uploadId ||
      !upload.partCount ||
      !upload.bytes
    ) {
      return Response.json({ error: 'multipart_upload_not_found' }, { status: 404 });
    }
    if (body.action === 'sign') {
      const partNumber = body.partNumber;
      if (
        typeof partNumber !== 'number' ||
        !Number.isInteger(partNumber) ||
        partNumber < 1 ||
        partNumber > upload.partCount
      ) {
        return Response.json({ error: 'invalid_part_number' }, { status: 400 });
      }
      try {
        const uploadUrl = await presignMultipartPart(
          upload.storageKey,
          upload.uploadId,
          partNumber,
        );
        return Response.json({
          partNumber,
          uploadUrl,
          method: 'PUT',
          expiresIn: UPLOAD_URL_TTL_SECONDS,
        });
      } catch {
        return Response.json({ error: 'storage_unavailable' }, { status: 503 });
      }
    }
    if (body.action !== 'complete')
      return Response.json({ error: 'invalid_action' }, { status: 400 });
    try {
      const listed = await listMultipartParts(upload.storageKey, upload.uploadId);
      if (listed.length !== upload.partCount) {
        return Response.json({ error: 'incomplete_upload' }, { status: 409 });
      }
      const parts: { partNumber: number; etag: string }[] = [];
      for (let index = 0; index < listed.length; index += 1) {
        const part = listed[index];
        const expectedBytes =
          index === listed.length - 1
            ? upload.bytes - index * MULTIPART_PART_BYTES
            : MULTIPART_PART_BYTES;
        if (part?.PartNumber !== index + 1 || part.Size !== expectedBytes || !part.ETag) {
          return Response.json({ error: 'invalid_uploaded_parts' }, { status: 409 });
        }
        parts.push({ partNumber: index + 1, etag: part.ETag });
      }
      await completeMultipartUpload(upload.storageKey, upload.uploadId, parts);
    } catch {
      // Complete may have succeeded while the response was lost; HEAD makes retry safe.
      const size = await objectSize(upload.storageKey).catch(() => undefined);
      if (size !== upload.bytes) {
        return Response.json({ error: 'multipart_complete_failed' }, { status: 503 });
      }
    }
    const result = await store.markUploadComplete({ jobId, bytes: upload.bytes });
    if (!result) return Response.json({ error: 'job_not_awaiting_upload' }, { status: 409 });
    return Response.json({ jobId, documentId: result.documentId, state: 'queued' });
  };
}
