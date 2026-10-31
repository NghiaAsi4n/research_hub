import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { BACKUP_TABLE_ORDER, parseBackup, restoreBackup } from '@research-hub/core/backup';
import { getDb } from '@research-hub/core/db/client';
import { sql } from 'drizzle-orm';

// Khôi phục file export vào một database đích (thường là branch Neon mới).
//
//   pnpm --filter @research-hub/pipeline backup:restore <file.json|.gz> [--reset]
//
// `--reset` xoá sạch các bảng nghiệp vụ trước khi ghi, chỉ dùng cho branch nháp.

const args = process.argv.slice(2);
const file = args.find((value) => !value.startsWith('--'));
const reset = args.includes('--reset');

if (file === undefined) {
  console.error('Dùng: backup:restore <file.json|.gz> [--reset]');
  process.exit(1);
}

const raw = readFileSync(file);
const text = file.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
const payload = parseBackup(text);

const db = getDb();
if (reset) {
  await db.execute(sql.raw(`truncate table ${BACKUP_TABLE_ORDER.join(', ')} cascade`));
}

const counts = await restoreBackup(db, payload);
console.log(JSON.stringify({ file, reset, counts }, null, 2));
