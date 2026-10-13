import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { getEnv } from '../env';
import * as schema from './schema';

// Neon serverless driver qua HTTP: hợp với function Vercel vì không giữ kết nối TCP.
// Tạo client theo kiểu lazy để không chạm mạng lúc import module.
let cached: ReturnType<typeof createDb> | null = null;

function createDb() {
  const sql = neon(getEnv().DATABASE_URL);
  return drizzle(sql, { schema });
}

export function getDb() {
  if (cached === null) {
    cached = createDb();
  }
  return cached;
}

export type Db = ReturnType<typeof getDb>;
export { schema };
