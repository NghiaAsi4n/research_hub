import { loadEnv } from '@research-hub/core/env';

// Kiểm tra sống còn: không chạm DB để luôn trả lời được, chỉ xác nhận cấu hình đã nạp đủ.
export async function GET() {
  try {
    const env = loadEnv();
    return Response.json({
      ok: true,
      auth: Boolean(env.NEON_AUTH_BASE_URL),
      cron: Boolean(env.CRON_SECRET),
      storage: Boolean(env.OBJECT_STORAGE_BUCKET),
    });
  } catch {
    return Response.json({ ok: false, error: 'env_invalid' }, { status: 500 });
  }
}
