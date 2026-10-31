import { BACKUP_TABLE_ORDER, buildBackup, restoreBackup } from '@research-hub/core/backup';
import { createDbAt, getDb } from '@research-hub/core/db/client';
import { sql } from 'drizzle-orm';

// Diễn tập khôi phục bằng một lệnh (Giai đoạn 5, T2).
//
//   DRILL_DATABASE_URL=postgresql://... pnpm --filter @research-hub/pipeline backup:drill
//
// Database đích phải đã chạy migration. Lệnh xoá sạch bảng nghiệp vụ ở đích, ghi lại từ bản
// export vừa tạo, rồi đối chiếu số dòng từng bảng. Không dùng cho database production.
const started = performance.now();
const targetUrl = process.env.DRILL_DATABASE_URL;
if (!targetUrl) {
  console.error('Thiếu DRILL_DATABASE_URL. Trỏ biến này tới database/branch đích đã migrate.');
  process.exit(1);
}

const source = getDb();
const target = createDbAt(targetUrl);

const exportStart = performance.now();
const payload = await buildBackup(source);
const exportMs = Math.round(performance.now() - exportStart);

const restoreStart = performance.now();
await target.execute(sql.raw(`truncate table ${BACKUP_TABLE_ORDER.join(', ')} cascade`));
const restored = await restoreBackup(target, payload);
const restoreMs = Math.round(performance.now() - restoreStart);

const verifyStart = performance.now();
const mismatches: { table: string; expected: number; actual: number }[] = [];
for (const table of BACKUP_TABLE_ORDER) {
  const expected = payload.tables[table]?.length ?? 0;
  const result = await target.execute<{ count: string | number }>(
    sql.raw(`select count(*)::int as count from ${table}`),
  );
  const actual = Number(result.rows[0]?.count ?? 0);
  if (actual !== expected) mismatches.push({ table, expected, actual });
}
const verifyMs = Math.round(performance.now() - verifyStart);
const totalMs = Math.round(performance.now() - started);

console.log(
  JSON.stringify(
    {
      exportMs,
      restoreMs,
      verifyMs,
      totalMs,
      under15Minutes: totalMs < 15 * 60 * 1000,
      restored,
      mismatches,
    },
    null,
    2,
  ),
);

if (mismatches.length > 0) process.exit(1);
