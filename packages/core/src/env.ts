import { z } from 'zod';

// Biến bắt buộc ngay từ Giai đoạn 0. Thiếu là dừng tiến trình, không chạy với cấu hình mơ hồ.
//
// Ghi chú thiết kế: bản plan ở mục 8 bước 5 vừa nói "thiếu khoá thì fail ngay khi khởi động"
// vừa yêu cầu để trống RESEND_API_KEY và SSI_API_KEY tới Giai đoạn 6. Hai câu đó mâu thuẫn,
// nên ở đây tách rõ: nhóm dưới đây bắt buộc, nhóm sau là tuỳ chọn.
const requiredShape = {
  DATABASE_URL: z.string().min(1, 'DATABASE_URL bắt buộc'),
  OLLAMA_API_KEY: z.string().min(1, 'OLLAMA_API_KEY bắt buộc'),
  CLOUDFLARE_API_TOKEN: z.string().min(1, 'CLOUDFLARE_API_TOKEN bắt buộc'),
  NEON_AUTH_BASE_URL: z.string().min(1, 'NEON_AUTH_BASE_URL bắt buộc'),
  NEON_AUTH_COOKIE_SECRET: z
    .string()
    .min(32, 'NEON_AUTH_COOKIE_SECRET cần ít nhất 32 ký tự (openssl rand -base64 32)'),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET cần ít nhất 16 ký tự'),
};

// Bật ở Giai đoạn 6. Để trống vẫn khởi động được.
const optionalShape = {
  SLACK_WEBHOOK_URL: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  SSI_API_KEY: z.string().min(1).optional(),
};

// Object Storage của Neon: `neon link` đẩy credential vào .env.local theo tên chuẩn AWS,
// nên đọc đúng tên đó thay vì tự đặt tiền tố riêng. Tên bucket không nằm trong .env.local
// mà khai ở neon.ts, nên vẫn cần một biến riêng. Cho phép trống để CI typecheck và build chạy được.
const storageShape = {
  AWS_ENDPOINT_URL_S3: z.string().min(1).optional(),
  AWS_REGION: z.string().min(1).optional(),
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  OBJECT_STORAGE_BUCKET: z.string().min(1).optional(),
};

// Endpoint Ollama. Để trống thì mặc định dùng Ollama chạy ở máy; đặt https://ollama.com khi
// muốn gọi cloud, và chỉ khi đó mới cần OLLAMA_API_KEY.
const ollamaShape = {
  OLLAMA_BASE_URL: z.string().min(1).optional(),
};

const envSchema = z.object({
  ...requiredShape,
  ...optionalShape,
  ...ollamaShape,
  ...storageShape,
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Cấu hình biến môi trường không hợp lệ:\n${issues}`);
  }
  return parsed.data;
}

// Chỉ trả TÊN biến sai hoặc thiếu (không trả giá trị) để `/api/health` nói được trên Vercel
// đang hụt khoá nào mà không làm lộ khoá.
export function envIssues(source: NodeJS.ProcessEnv = process.env): string[] {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) {
    return [];
  }
  return [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
}

let cached: Env | null = null;

// Đọc muộn thay vì validate ở cấp module: nếu validate ngay lúc import thì `next build`
// sẽ đổ khi máy build chưa có biến môi trường. Route handler gọi hàm này ở đầu request.
export function getEnv(): Env {
  if (cached === null) {
    cached = loadEnv();
  }
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}

// Ollama chạy ở máy, không cần khoá. Đây là giá trị dùng khi OLLAMA_BASE_URL bỏ trống.
export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

// Chuẩn hoá endpoint: bỏ khoảng trắng và dấu gạch chéo cuối để ghép đường dẫn không bị "//api/embed".
export function resolveOllamaBaseUrl(value?: string | null): string {
  const raw = (value ?? '').trim();
  return (raw === '' ? DEFAULT_OLLAMA_BASE_URL : raw).replace(/\/+$/, '');
}

// Ollama cục bộ không cần Authorization; chỉ gửi khoá khi gọi endpoint từ xa.
export function isLocalOllamaEndpoint(endpoint: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(endpoint);
}
