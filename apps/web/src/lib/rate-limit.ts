// Rate limit cơ bản cho Giai đoạn 0: cửa sổ trượt trong bộ nhớ tiến trình.
//
// Giới hạn đã biết: mỗi instance function có bộ đếm riêng và mất khi instance tái tạo, nên
// đây chỉ là chặn thô. Giai đoạn 5 sẽ thay bằng bộ đếm dùng chung (bảng `settings` hoặc Redis
// miễn phí) — plan mục 8 bước 3 của Giai đoạn 5 đã ghi việc này.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { allowed: true };
}

export function resetRateLimits(): void {
  buckets.clear();
}
