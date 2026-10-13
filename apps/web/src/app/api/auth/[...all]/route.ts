import { isSignUpRequest } from '@research-hub/core/auth';
import { getAuth } from '@/lib/auth/server';

// Chuyển tiếp mọi lời gọi auth sang Managed Better Auth qua `auth.handler()`, nhưng chặn luồng
// đăng ký: plan chốt đăng ký đóng, chỉ một tài khoản chủ (mục 2 và ranh giới 6).
// Next đặt tên tham số động là `all` (theo tên thư mục [...all]), còn handler của Neon Auth
// lại khai báo `{ path: string[] }`. Giữ kiểu theo Next ở chữ ký export và ép kiểu tại chỗ gọi.
type Ctx = { params: Promise<{ all: string[] }> };
type NeonCtx = { params: Promise<{ path: string[] }> };

async function handle(request: Request, ctx: Ctx, method: 'GET' | 'POST') {
  if (isSignUpRequest(new URL(request.url).pathname)) {
    return Response.json({ error: 'sign_up_disabled' }, { status: 403 });
  }
  return getAuth()
    .handler()
    [method](request, ctx as unknown as NeonCtx);
}

export const GET = (request: Request, ctx: Ctx) => handle(request, ctx, 'GET');
export const POST = (request: Request, ctx: Ctx) => handle(request, ctx, 'POST');
