import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { getDb } from './db/client';
import { documents } from './db/schema';

// Cập nhật trạng thái đọc của một tài liệu (Giai đoạn 1, T4/T5).
//
// Giá trị `status` khớp cột `documents.status`: `pending` khi mới ingest, `ready` khi đã có bản
// Markdown sạch trong Object Storage, `unreadable` khi nguồn không có nội dung đọc được (trang chỉ
// render bằng JavaScript, PDF scan không có lớp văn bản), `failed` khi hỏng ở phía mạng hoặc nguồn.
//
// Thời gian đọc nằm trong `meta.readMs` chứ không phải cột riêng: đối chiếu trần 300 giây của
// giai đoạn chỉ cần đọc ra từ jsonb, khỏi thêm migration.

export type DocumentStatus = 'pending' | 'ready' | 'unreadable' | 'failed';

export type MarkReadyInput = {
  id: string;
  title?: string;
  bytes?: number;
  pages?: number;
  meta?: Record<string, unknown>;
};

export type MarkStoppedInput = {
  id: string;
  reason: string;
  meta?: Record<string, unknown>;
};

export type DocumentStore = {
  markReady(input: MarkReadyInput): Promise<void>;
  markUnreadable(input: MarkStoppedInput): Promise<void>;
  markFailed(input: MarkStoppedInput): Promise<void>;
};

export function createDocumentStore(db?: Db): DocumentStore {
  // Dựng muộn như `createIngestStore`: route và CLI đều gọi hàm này ở phạm vi module.
  let resolved: Db | null = db ?? null;
  const handle = (): Db => {
    resolved ??= getDb();
    return resolved;
  };

  const update = async (
    id: string,
    status: DocumentStatus,
    fields: Record<string, unknown>,
  ): Promise<void> => {
    await handle()
      .update(documents)
      .set({ status, ...fields })
      .where(eq(documents.id, id));
  };

  return {
    async markReady(input) {
      await update(input.id, 'ready', {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.bytes === undefined ? {} : { bytes: input.bytes }),
        ...(input.pages === undefined ? {} : { pages: input.pages }),
        ...(input.meta === undefined ? {} : { meta: input.meta }),
      });
    },

    async markUnreadable(input) {
      await update(input.id, 'unreadable', {
        meta: { reason: input.reason, ...input.meta },
      });
    },

    async markFailed(input) {
      await update(input.id, 'failed', {
        meta: { reason: input.reason, ...input.meta },
      });
    },
  };
}
