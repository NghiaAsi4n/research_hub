import { createNeonAuth } from '@neondatabase/auth/next/server';
import { isSignUpRequest } from '@research-hub/core/auth';
import { type NextRequest, NextResponse } from 'next/server';

// Next.js 16 đổi tên file này: `proxy.ts` thay cho `middleware.ts`, hàm export tên là `proxy`.
// Trên bản Next cũ hơn thì đặt tên file `middleware.ts` và export `default function middleware`.
//
// Nhiệm vụ: chặn ở tầng trang — chưa đăng nhập thì Neon Auth đẩy về /sign-in, và chặn luồng
// đăng ký vì plan chốt đăng ký đóng. Các route /api tự gọi `requireUser()`,
// riêng /api/cron dùng CRON_SECRET nên không đi qua đây.
type NeonMiddleware = ReturnType<ReturnType<typeof createNeonAuth>['middleware']>;

let cached: NeonMiddleware | null = null;

function authMiddleware(request: NextRequest) {
  if (cached === null) {
    const auth = createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL ?? '',
      cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET ?? '' },
    });
    cached = auth.middleware({ loginUrl: '/sign-in' });
  }
  return cached(request);
}

export default async function proxy(request: NextRequest) {
  if (isSignUpRequest(request.nextUrl.pathname)) {
    return NextResponse.json({ error: 'sign_up_disabled' }, { status: 403 });
  }
  return authMiddleware(request);
}

export const config = {
  matcher: [
    '/library/:path*',
    '/chat/:path*',
    '/research/:path*',
    '/notes/:path*',
    '/watchlist/:path*',
  ],
};
