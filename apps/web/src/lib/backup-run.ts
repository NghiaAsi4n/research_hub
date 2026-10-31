import { gzipSync } from 'node:zlib';
import {
  backupCounts,
  backupObjectKey,
  buildBackup,
  serializeBackup,
} from '@research-hub/core/backup';
import { type Db, getDb } from '@research-hub/core/db/client';
import { assertNoSecrets } from '@research-hub/core/secrets';
import { putObject } from '@research-hub/core/storage';

export type BackupResult = {
  key: string;
  bytes: number;
  counts: Record<string, number>;
};

// Một lượt export: đọc dữ liệu logic, nén gzip, ghi lên Object Storage theo ngày UTC.
export async function createBackup(
  input: {
    now?: Date;
    db?: Db;
    put?: (key: string, body: string | Uint8Array, contentType: string) => Promise<unknown>;
  } = {},
): Promise<BackupResult> {
  const now = input.now ?? new Date();
  const payload = await buildBackup(input.db ?? getDb());
  const serialized = serializeBackup(payload);
  assertNoSecrets(serialized, 'file export');
  const compressed = gzipSync(serialized, { level: 9 });
  const key = backupObjectKey(now);
  const put = input.put ?? putObject;
  await put(key, compressed, 'application/gzip');
  return { key, bytes: compressed.byteLength, counts: backupCounts(payload) };
}
