import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { getEnv } from '../env';
import * as schema from './schema';

// Neon serverless driver qua HTTP: hợp với function Vercel vì không giữ kết nối TCP.
// Tạo client theo kiểu lazy để không chạm mạng lúc import module.
let cached: ReturnType<typeof createDb> | null = null;

function createDb() {
  return createDbAt(getEnv().DATABASE_URL);
}

// Kết nối tới một database khác (ví dụ branch đích của diễn tập khôi phục) mà không đổi cache.
export function createDbAt(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export function getDb() {
  if (cached === null) {
    cached = createDb();
  }
  return cached;
}

export type Db = ReturnType<typeof createDbAt>;
export { schema };
