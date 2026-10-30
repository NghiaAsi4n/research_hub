import { getDb } from '@research-hub/core/db/client';
import { getEnv } from '@research-hub/core/env';
import { seedGoldCorpus } from '@research-hub/core/gold-seed';

// Nạp sáu tài liệu mẫu của bộ câu hỏi vàng (Giai đoạn 2, T5).
//
// Chỉ ghi tài liệu và chunk, chưa sinh vector: chạy `/api/maintenance/index` sau đó để nhúng.
// Bảo vệ bằng `CRON_SECRET` như các route bảo trì khác.

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const secret = getEnv().CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const reports = await seedGoldCorpus({ db: getDb() });
  return Response.json({
    documents: reports.length,
    chunks: reports.reduce((sum, entry) => sum + entry.chunks, 0),
    reports,
  });
}
