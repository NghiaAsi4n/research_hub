import type { Config } from 'drizzle-kit';

// Dùng cho `drizzle-kit generate` và `drizzle-kit migrate` ở root.
// Credential đọc từ biến môi trường khi chạy migrate, không nhúng vào file này.
export default {
  schema: './packages/core/src/db/schema.ts',
  out: './packages/core/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
} satisfies Config;
