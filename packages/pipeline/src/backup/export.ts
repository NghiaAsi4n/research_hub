import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { buildBackup, serializeBackup } from '@research-hub/core/backup';
import { getDb } from '@research-hub/core/db/client';

// Xuất dữ liệu ra file để chuyển sang môi trường khác hoặc đưa vào restore.
//
//   pnpm --filter @research-hub/pipeline backup:export <file.json.gz>

const file = process.argv[2];
if (file === undefined) {
  console.error('Dùng: backup:export <file.json.gz>');
  process.exit(1);
}

const payload = await buildBackup(getDb());
const compressed = gzipSync(serializeBackup(payload), { level: 9 });
writeFileSync(file, compressed);
console.log(
  JSON.stringify({
    file,
    bytes: compressed.byteLength,
    counts: Object.fromEntries(
      Object.entries(payload.tables).map(([name, rows]) => [name, rows.length]),
    ),
  }),
);
