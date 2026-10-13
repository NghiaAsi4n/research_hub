import { beforeEach, describe, expect, it, vi } from 'vitest';

const { guardMock, presignMock } = vi.hoisted(() => ({
  guardMock: vi.fn(),
  presignMock: vi.fn(),
}));

vi.mock('./guard', () => ({ guardRequest: guardMock }));
vi.mock('@research-hub/core/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@research-hub/core/storage')>();
  return { ...actual, presignUpload: presignMock };
});

import type {
  DocumentUpsert,
  IngestStore,
  JobUpsert,
  SourceUpsert,
} from '@research-hub/core/ingest-store';
import { createIngestDoneHandler, createIngestHandler } from './ingest-handler';

type StoredDocument = DocumentUpsert & { id: string; bytes: number | null };
type StoredJob = JobUpsert & { id: string };

// Store giả giữ đúng ngữ nghĩa chống trùng của Postgres: `sources` khoá theo id suy từ nguồn,
// `documents` theo `hash`, `jobs` theo `idem_key`. Nhờ vậy test khẳng định được điều mà chỉ mục
// duy nhất trong schema bảo đảm, mà không cần kết nối cơ sở dữ liệu.
function memoryStore() {
  const sources = new Map<string, SourceUpsert>();
  const documents = new Map<string, StoredDocument>();
  const jobs = new Map<string, StoredJob>();
  let sequence = 0;
  const nextId = () => {
    sequence += 1;
    return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
  };

  const store: IngestStore = {
    async upsertSource(row) {
      if (!sources.has(row.id)) {
        sources.set(row.id, row);
      }
      return { id: row.id };
    },
    async upsertDocument(row) {
      const existing = documents.get(row.hash);
      if (existing !== undefined) {
        return { id: existing.id, storageKey: existing.storageKey };
      }
      const created: StoredDocument = { ...row, id: nextId(), bytes: null };
      documents.set(row.hash, created);
      return { id: created.id, storageKey: created.storageKey };
    },
    async upsertJob(row) {
      const existing = jobs.get(row.idemKey);
      if (existing !== undefined) {
        return { id: existing.id, state: existing.state };
      }
      const created: StoredJob = { ...row, id: nextId() };
      jobs.set(row.idemKey, created);
      return { id: created.id, state: created.state };
    },
    async markUploadComplete({ jobId, bytes }) {
      const job = [...jobs.values()].find((entry) => entry.id === jobId);
      if (job === undefined || job.state !== 'awaiting_upload') {
        return null;
      }
      job.state = 'queued';
      const documentId = job.payload.documentId;
      const document =
        typeof documentId === 'string'
          ? [...documents.values()].find((entry) => entry.id === documentId)
          : undefined;
      if (document !== undefined && bytes !== undefined) {
        document.bytes = bytes;
      }
      return { jobId: job.id, documentId: typeof documentId === 'string' ? documentId : null };
    },
  };

  return { store, sources, documents, jobs };
}

function ingestRequest(body: unknown): Request {
  return new Request('http://localhost/api/ingest', { method: 'POST', body: JSON.stringify(body) });
}

const fileBody = { filename: 'Hop dong.pdf', contentType: 'application/pdf' };

beforeEach(() => {
  guardMock.mockReset();
  guardMock.mockResolvedValue({ ok: true, subject: 'user-1' });
  presignMock.mockReset();
  presignMock.mockResolvedValue('https://storage.example/upload');
});

describe('POST /api/ingest', () => {
  it('ghi sources, documents, jobs và ký URL cho nguồn là file', async () => {
    const { store, sources, documents, jobs } = memoryStore();
    const response = await createIngestHandler(store)(ingestRequest(fileBody));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(sources.size).toBe(1);
    expect(documents.size).toBe(1);
    expect(jobs.size).toBe(1);
    expect(body).toMatchObject({ state: 'awaiting_upload', method: 'PUT', expiresIn: 300 });
    expect(typeof body.jobId).toBe('string');
    expect(documents.get([...documents.keys()][0] as string)?.sourceId).toBe(body.sourceId);
    expect(presignMock).toHaveBeenCalledWith(body.key, 'application/pdf');
  });

  it('gọi hai lần với cùng một file chỉ sinh một document và một job', async () => {
    const { store, documents, jobs } = memoryStore();
    const POST = createIngestHandler(store);

    const first = await (await POST(ingestRequest(fileBody))).json();
    const second = await (await POST(ingestRequest(fileBody))).json();

    expect(documents.size).toBe(1);
    expect(jobs.size).toBe(1);
    expect(second.jobId).toBe(first.jobId);
    expect(second.documentId).toBe(first.documentId);
    expect(second.key).toBe(first.key);
    // Lần thứ hai vẫn phải ký theo khoá đã lưu, không phải khoá mới sinh.
    expect(presignMock.mock.calls[1]?.[0]).toBe(first.key);
  });

  it('nguồn là URL thì job sẵn sàng ngay và không ký URL', async () => {
    const { store, jobs } = memoryStore();
    const response = await createIngestHandler(store)(
      ingestRequest({ sourceUrl: 'https://example.com/bai-viet?utm_source=fb' }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.state).toBe('queued');
    expect(body.uploadUrl).toBeUndefined();
    expect(presignMock).not.toHaveBeenCalled();
    expect(jobs.get([...jobs.keys()][0] as string)?.payload).toMatchObject({
      url: 'https://example.com/bai-viet',
    });
  });

  it('trả 400 cho dữ liệu vào sai và không ghi gì', async () => {
    const { store, sources, documents, jobs } = memoryStore();
    const POST = createIngestHandler(store);

    const missingType = await POST(ingestRequest({ filename: 'x.pdf' }));
    expect(missingType.status).toBe(400);
    await expect(missingType.json()).resolves.toMatchObject({ error: 'invalid_content_type' });

    const badUrl = await POST(ingestRequest({ sourceUrl: 'khong-phai-url' }));
    expect(badUrl.status).toBe(400);
    await expect(badUrl.json()).resolves.toMatchObject({ error: 'invalid_source_url' });

    expect(sources.size + documents.size + jobs.size).toBe(0);
  });

  it('trả 503 khi chưa có credential Object Storage', async () => {
    const { store } = memoryStore();
    presignMock.mockRejectedValue(new Error('Thiếu credential Object Storage'));

    const response = await createIngestHandler(store)(ingestRequest(fileBody));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: 'storage_unavailable' });
  });

  it('giữ nguyên phản hồi từ chối của guard', async () => {
    const { store } = memoryStore();
    guardMock.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'unauthorized' }, { status: 401 }),
    });

    const response = await createIngestHandler(store)(ingestRequest(fileBody));
    expect(response.status).toBe(401);
  });
});

describe('POST /api/ingest/done', () => {
  it('chuyển job sang queued, ghi số byte và không nhận báo lại lần hai', async () => {
    const { store } = memoryStore();
    const created = await (await createIngestHandler(store)(ingestRequest(fileBody))).json();
    const POST = createIngestDoneHandler(store);

    const done = await POST(
      new Request('http://localhost/api/ingest/done', {
        method: 'POST',
        body: JSON.stringify({ jobId: created.jobId, bytes: 1234 }),
      }),
    );
    expect(done.status).toBe(200);
    await expect(done.json()).resolves.toEqual({
      jobId: created.jobId,
      documentId: created.documentId,
      state: 'queued',
    });

    const again = await POST(
      new Request('http://localhost/api/ingest/done', {
        method: 'POST',
        body: JSON.stringify({ jobId: created.jobId }),
      }),
    );
    expect(again.status).toBe(404);
  });

  it('từ chối jobId không phải UUID bằng 400', async () => {
    const { store } = memoryStore();
    const response = await createIngestDoneHandler(store)(
      new Request('http://localhost/api/ingest/done', {
        method: 'POST',
        body: JSON.stringify({ jobId: 'job-1' }),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_job_id' });
  });
});
