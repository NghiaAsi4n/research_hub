// Guard dùng chung cho mọi route đốt hạn mức (plan mục 3, ranh giới 5).
//
// Thứ tự kiểm là cố định: phiên hợp lệ → allowlist model/nguồn → rate limit theo người dùng.
// Phần quyết định nằm ở core để test được mà không cần Next.js; việc đếm hạn mức và ghi log do
// lớp gọi truyền vào (xem `apps/web/src/lib/guard.ts`).

export type GuardRoute = 'embed' | 'ingest';

// Ngưỡng khai một chỗ: đổi ở đây là mọi route theo ngay, không phải sửa từng route.
export const GUARD_LIMITS: Record<GuardRoute, { limit: number; windowMs: number }> = {
  embed: { limit: 20, windowMs: 60_000 },
  ingest: { limit: 30, windowMs: 60_000 },
};

// Chỉ model nhúng cục bộ đã pull ở Giai đoạn 0 mới được gọi ở route `/api/embed`.
export const ALLOWED_EMBED_MODELS = ['bge-m3'] as const;

// Loại nguồn được phép ghi vào Object Storage; khớp với `ALLOWED_KINDS` cũ ở route ingest.
export const ALLOWED_SOURCE_KINDS = ['documents', 'media'] as const;

export type RefusalReason =
  | 'unauthorized'
  | 'rate_limited'
  | 'model_not_allowed'
  | 'source_not_allowed';

export const REFUSAL_STATUS: Record<RefusalReason, number> = {
  unauthorized: 401,
  rate_limited: 429,
  model_not_allowed: 400,
  source_not_allowed: 400,
};

export type RateLimitOutcome = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type GuardRefusal = {
  allowed: false;
  reason: RefusalReason;
  status: number;
  retryAfterSeconds?: number;
};

export type GuardOutcome =
  | { allowed: true; subject: string; key: string; limit: { limit: number; windowMs: number } }
  | GuardRefusal;

export function isModelAllowed(model: string): boolean {
  return (ALLOWED_EMBED_MODELS as readonly string[]).includes(model);
}

export function isSourceKindAllowed(kind: string): boolean {
  return (ALLOWED_SOURCE_KINDS as readonly string[]).includes(kind);
}

function refuse(reason: RefusalReason, retryAfterSeconds?: number): GuardRefusal {
  return retryAfterSeconds === undefined
    ? { allowed: false, reason, status: REFUSAL_STATUS[reason] }
    : { allowed: false, reason, status: REFUSAL_STATUS[reason], retryAfterSeconds };
}

export function guardQuotaRoute(input: {
  route: GuardRoute;
  subject: string | null;
  model?: string;
  sourceKind?: string;
  consumeRateLimit: (key: string, limit: number, windowMs: number) => RateLimitOutcome;
}): GuardOutcome {
  if (input.subject === null || input.subject === '') {
    return refuse('unauthorized');
  }

  if (input.model !== undefined && !isModelAllowed(input.model)) {
    return refuse('model_not_allowed');
  }

  if (input.sourceKind !== undefined && !isSourceKindAllowed(input.sourceKind)) {
    return refuse('source_not_allowed');
  }

  const limit = GUARD_LIMITS[input.route];
  const key = `${input.route}:${input.subject}`;
  const outcome = input.consumeRateLimit(key, limit.limit, limit.windowMs);
  if (!outcome.allowed) {
    return refuse('rate_limited', outcome.retryAfterSeconds);
  }

  return { allowed: true, subject: input.subject, key, limit };
}
