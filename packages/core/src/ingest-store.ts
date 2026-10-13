import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { getDb } from './db/client';
import { documents, jobs, sources } from './db/schema';

// Cửa duy nhất ghi bản ghi ingest vào Postgres (Giai đoạn 1, T3).
//
// Chống trùng dựa vào chỉ mục duy nhất đã có từ T1: `documents.hash` và `jobs.idem_key`, cùng khoá
// chính `sources.id` (id suy từ chính nguồn). Vì vậy mỗi lệnh ở đây là "ghi đè" chứ không phải
// "thêm mới", và gọi lại cùng một nguồn luôn trả về đúng dòng cũ.
//
// Phần `set` cố tình là biểu thức vô hại (`sql` trỏ về chính cột đó): upsert cần một mệnh đề SET để
// Postgres trả về dòng cũ, nhưng không được phép ghi đè trạng thái mà pipeline đang xử lý.

export type SourceUpsert = {
  id: string;
  kind: string;
  url: string;
  domain: string | null;
};

export type DocumentUpsert = {
  sourceId: string;
  title: string;
  storageKey: string;
  hash: string;
};

export type JobUpsert = {
  type: string;
  idemKey: string;
  state: string;
  payload: Record<string, unknown>;
};

export type IngestStore = {
  upsertSource(row: SourceUpsert): Promise<{ id: string }>;
  upsertDocument(row: DocumentUpsert): Promise<{ id: string; storageKey: string }>;
  upsertJob(row: JobUpsert): Promise<{ id: string; state: string }>;
  markUploadComplete(input: {
    jobId: string;
    bytes?: number;
  }): Promise<{ jobId: string; documentId: string | null } | null>;
};

function documentIdFromPayload(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const id = (payload as { documentId?: unknown }).documentId;
  return typeof id === 'string' && id !== '' ? id : null;
}

export function createIngestStore(db?: Db): IngestStore {
  // Kết nối dựng muộn giống `getDb`/`getAuth`: route gọi `createIngestStore()` ngay ở phạm vi
  // module, mà `getDb()` lại kiểm tra biến môi trường — chạm sớm sẽ làm `next build` hỏng khi máy
  // chưa có `.env.local`.
  let resolved: Db | null = db ?? null;
  const handle = (): Db => {
    resolved ??= getDb();
    return resolved;
  };

  return {
    async upsertSource(row) {
      const [source] = await handle()
        .insert(sources)
        .values({ id: row.id, kind: row.kind, url: row.url, domain: row.domain })
        .onConflictDoUpdate({
          target: sources.id,
          set: { kind: sql`${sources.kind}` },
        })
        .returning({ id: sources.id });

      if (source === undefined) {
        throw new Error('upsert sources không trả về dòng nào');
      }
      return { id: source.id };
    },

    async upsertDocument(row) {
      const [document] = await handle()
        .insert(documents)
        .values({
          sourceId: row.sourceId,
          title: row.title,
          storageKey: row.storageKey,
          hash: row.hash,
          status: 'pending',
        })
        .onConflictDoUpdate({
          target: documents.hash,
          set: { title: sql`${documents.title}` },
        })
        .returning({ id: documents.id, storageKey: documents.storageKey });

      if (document === undefined) {
        throw new Error('upsert documents không trả về dòng nào');
      }
      return { id: document.id, storageKey: document.storageKey };
    },

    async upsertJob(row) {
      const [job] = await handle()
        .insert(jobs)
        .values({
          type: row.type,
          idemKey: row.idemKey,
          state: row.state,
          payload: row.payload,
        })
        .onConflictDoUpdate({
          target: jobs.idemKey,
          set: { payload: sql`${jobs.payload}` },
        })
        .returning({ id: jobs.id, state: jobs.state });

      if (job === undefined) {
        throw new Error('upsert jobs không trả về dòng nào');
      }
      return { id: job.id, state: job.state };
    },

    async markUploadComplete(input) {
      const [job] = await handle()
        .update(jobs)
        .set({ state: 'queued', runAt: new Date() })
        .where(and(eq(jobs.id, input.jobId), eq(jobs.state, 'awaiting_upload')))
        .returning({ id: jobs.id, payload: jobs.payload });

      if (job === undefined) {
        return null;
      }

      const documentId = documentIdFromPayload(job.payload);
      if (documentId !== null && input.bytes !== undefined) {
        await handle()
          .update(documents)
          .set({ bytes: input.bytes })
          .where(eq(documents.id, documentId));
      }
      return { jobId: job.id, documentId };
    },
  };
}
