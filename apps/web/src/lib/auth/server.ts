import { createNeonAuth } from '@neondatabase/auth/next/server';
import { getEnv } from '@research-hub/core/env';

// Guard dùng chung cho mọi route đốt hạn mức (plan mục 3, ranh giới 5).
//
// API thật của @neondatabase/auth 0.5.0-beta: `createNeonAuth` là thứ duy nhất được export từ
// entrypoint `next/server`; nó trả về instance có `.handler()`, `.middleware()` và `.getSession()`.
// `authApiHandler` / `neonAuthMiddleware` chỉ được khai báo nội bộ trong package, không export.
type NeonAuth = ReturnType<typeof createNeonAuth>;

let cached: NeonAuth | null = null;

// Dựng muộn để `next build` không cần biến môi trường.
export function getAuth(): NeonAuth {
  if (cached === null) {
    const env = getEnv();
    cached = createNeonAuth({
      baseUrl: env.NEON_AUTH_BASE_URL,
      cookies: { secret: env.NEON_AUTH_COOKIE_SECRET },
    });
  }
  return cached;
}

export async function getSession() {
  const { data } = await getAuth().getSession();
  return data;
}

export type Session = Awaited<ReturnType<typeof getSession>>;

export class UnauthorizedError extends Error {
  constructor() {
    super('Cần đăng nhập');
    this.name = 'UnauthorizedError';
  }
}

export async function requireUser() {
  const session = await getSession();
  if (!session) {
    throw new UnauthorizedError();
  }
  return session;
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

export function tooManyRequestsResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: 'rate_limited', retryAfterSeconds },
    { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
  );
}
