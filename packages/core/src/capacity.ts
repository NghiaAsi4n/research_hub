import { sql } from 'drizzle-orm';
import { type Db, getDb } from './db/client';
import { getEnv } from './env';
import { objectStorageUsage } from './storage';

// Đo dung lượng để cảnh báo trước khi chạm hạn mức miễn phí (Giai đoạn 5, T1).
//
// Hạn mức để trong biến môi trường vì gói free thay đổi theo thời gian; mặc định bám gói đang dùng
// (0,5 GB database, 1 GB Object Storage) và cảnh báo ở 70%.

export const DEFAULT_DB_QUOTA_BYTES = 512 * 1024 * 1024;
export const DEFAULT_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;
export const CAPACITY_WARNING_RATIO = 0.7;

export type CapacityReport = {
  databaseBytes: number;
  storageBytes: number;
  databaseQuotaBytes: number;
  storageQuotaBytes: number;
  databaseRatio: number;
  storageRatio: number;
  warning: boolean;
  exceeded: boolean;
  checkedAt: string;
};

export function parseQuota(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveQuotas(env: { DB_QUOTA_BYTES?: string; STORAGE_QUOTA_BYTES?: string }): {
  databaseQuotaBytes: number;
  storageQuotaBytes: number;
} {
  return {
    databaseQuotaBytes: parseQuota(env.DB_QUOTA_BYTES, DEFAULT_DB_QUOTA_BYTES),
    storageQuotaBytes: parseQuota(env.STORAGE_QUOTA_BYTES, DEFAULT_STORAGE_QUOTA_BYTES),
  };
}

export function buildCapacityReport(input: {
  databaseBytes: number;
  storageBytes: number;
  databaseQuotaBytes: number;
  storageQuotaBytes: number;
  checkedAt?: Date;
}): CapacityReport {
  const databaseRatio =
    input.databaseQuotaBytes > 0 ? input.databaseBytes / input.databaseQuotaBytes : 0;
  const storageRatio =
    input.storageQuotaBytes > 0 ? input.storageBytes / input.storageQuotaBytes : 0;
  return {
    databaseBytes: input.databaseBytes,
    storageBytes: input.storageBytes,
    databaseQuotaBytes: input.databaseQuotaBytes,
    storageQuotaBytes: input.storageQuotaBytes,
    databaseRatio,
    storageRatio,
    warning: databaseRatio >= CAPACITY_WARNING_RATIO || storageRatio >= CAPACITY_WARNING_RATIO,
    exceeded: databaseRatio >= 1 || storageRatio >= 1,
    checkedAt: (input.checkedAt ?? new Date()).toISOString(),
  };
}

export async function databaseBytes(db?: Db): Promise<number> {
  const result = await (db ?? getDb()).execute<{ bytes: string | number }>(
    sql`select pg_database_size(current_database()) as bytes`,
  );
  return Number(result.rows[0]?.bytes ?? 0);
}

export async function capacityReport(): Promise<CapacityReport> {
  const [dbBytes, storageBytes] = await Promise.all([databaseBytes(), objectStorageUsage()]);
  return buildCapacityReport({
    databaseBytes: dbBytes,
    storageBytes,
    ...resolveQuotas(getEnv()),
  });
}
