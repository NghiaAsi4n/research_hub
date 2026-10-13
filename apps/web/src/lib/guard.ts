import { type GuardOutcome, type GuardRoute, guardQuotaRoute } from '@research-hub/core/guard';
import { getSession } from './auth/server';
import { checkRateLimit } from './rate-limit';

// Cửa duy nhất để một route đốt hạn mức đi qua: lấy phiên, gọi quyết định ở
// `@research-hub/core/guard`, đếm hạn mức theo người dùng và ghi lý do từ chối.
//
// Route mới gọi model hoặc đọc nguồn phải dùng `guardRequest` ngay từ đầu, không tự gọi
// `requireUser` rồi `checkRateLimit` như hai route cũ.
//
// Import nội bộ dùng đường dẫn tương đối để test mock được `./auth/server`.

export type GuardSuccess = { ok: true; subject: string };
export type GuardFailure = { ok: false; response: Response };
export type GuardResult = GuardSuccess | GuardFailure;

type Refusal = Extract<GuardOutcome, { allowed: false }>;

export function sessionSubject(session: unknown): string | null {
  if (typeof session !== 'object' || session === null) {
    return null;
  }
  const user = (session as { user?: { id?: unknown; email?: unknown } }).user;
  if (typeof user?.id === 'string' && user.id.length > 0) {
    return user.id;
  }
  if (typeof user?.email === 'string' && user.email.length > 0) {
    return user.email;
  }
  // Có phiên nhưng không đọc được định danh: vẫn cho qua với khoá dùng chung, để đổi kiểu dữ
  // liệu của thư viện auth không chặn nhầm người dùng hợp lệ.
  return 'session';
}

export function refusalResponse(outcome: Refusal): Response {
  const body: Record<string, unknown> = { error: outcome.reason };
  const headers: Record<string, string> = {};
  if (outcome.reason === 'rate_limited' && outcome.retryAfterSeconds !== undefined) {
    body.retryAfterSeconds = outcome.retryAfterSeconds;
    headers['retry-after'] = String(outcome.retryAfterSeconds);
  }
  return Response.json(body, { status: outcome.status, headers });
}

export function logRefusal(route: GuardRoute, outcome: Refusal): void {
  console.warn(
    JSON.stringify({
      event: 'guard_refusal',
      route,
      reason: outcome.reason,
      retryAfterSeconds: outcome.retryAfterSeconds ?? null,
    }),
  );
}

export async function guardRequest(input: {
  route: GuardRoute;
  model?: string;
  sourceKind?: string;
}): Promise<GuardResult> {
  const session = await getSession();

  const outcome = guardQuotaRoute({
    route: input.route,
    subject: sessionSubject(session),
    model: input.model,
    sourceKind: input.sourceKind,
    consumeRateLimit: (key, limit, windowMs) => checkRateLimit(key, limit, windowMs),
  });

  if (outcome.allowed) {
    return { ok: true, subject: outcome.subject };
  }

  logRefusal(input.route, outcome);
  return { ok: false, response: refusalResponse(outcome) };
}
