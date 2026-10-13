import { requireUser, tooManyRequestsResponse, unauthorizedResponse } from '@/lib/auth/server';
import { checkRateLimit } from '@/lib/rate-limit';

// Giai đoạn 0: đã có xác thực và rate limit, chưa có phần ingest.
// Việc thật (tạo `jobs`, ký URL upload) thuộc Giai đoạn 1 — plan mục 8.
export async function POST() {
  try {
    await requireUser();
  } catch {
    return unauthorizedResponse();
  }

  const limit = checkRateLimit('ingest', 30, 60_000);
  if (!limit.allowed) {
    return tooManyRequestsResponse(limit.retryAfterSeconds);
  }

  return Response.json({ status: 'not_implemented', phase: 1 }, { status: 501 });
}
