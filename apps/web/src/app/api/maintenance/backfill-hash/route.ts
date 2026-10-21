import { backfillContentHashes } from '@research-hub/core/backfill-hash';
import { getEnv } from '@research-hub/core/env';

// Backfill một lần cho các tài liệu `ready` có từ trước T9 (Giai đoạn 1, T9).
//
// Bảo vệ bằng `CRON_SECRET` như route cron: không mở endpoint công khai để đọc Object Storage
// và đổi hash. Chạy theo lô có con trỏ; gọi lặp với `cursor` trả về cho tới khi `remaining=false`.
// `?dryRun=1` chỉ báo việc sẽ làm, không ghi.

export const maxDuration = 300;

function parseCursor(url: URL) {
  const createdAt = url.searchParams.get('createdAt');
  const id = url.searchParams.get('id');
  return createdAt && id ? { createdAt, id } : undefined;
}

export async function POST(request: Request): Promise<Response> {
  const secret = getEnv().CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') ?? undefined);
  const report = await backfillContentHashes({
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    dryRun: url.searchParams.get('dryRun') === '1',
    cursor: parseCursor(url),
  });
  return Response.json(report);
}
