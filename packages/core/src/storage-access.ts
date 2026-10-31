import { getEnv } from './env';
import { anonymousBucketListBlocked, bucketPolicyIsPublic } from './storage';

// Kiểm tra quyền truy cập Object Storage (Giai đoạn 5, T5).
//
// Bucket chỉ đạt khi policy không công khai và request không ký bị từ chối. Giá trị `null` nghĩa là
// backend không trả thông tin đó, nên không được coi là đạt.

export type StorageAccessReport = {
  bucket: string | null;
  publicPolicy: boolean | null;
  anonymousListBlocked: boolean | null;
  ok: boolean;
  checkedAt: string;
};

export function storageAccessVerdict(input: {
  bucket: string | null;
  publicPolicy: boolean | null;
  anonymousListBlocked: boolean | null;
  checkedAt?: Date;
}): StorageAccessReport {
  return {
    ...input,
    ok: input.publicPolicy === false && input.anonymousListBlocked === true,
    checkedAt: (input.checkedAt ?? new Date()).toISOString(),
  };
}

export async function checkStorageAccess(): Promise<StorageAccessReport> {
  const [publicPolicy, anonymousListBlocked] = await Promise.all([
    bucketPolicyIsPublic(),
    anonymousBucketListBlocked(),
  ]);
  return storageAccessVerdict({
    bucket: getEnv().OBJECT_STORAGE_BUCKET ?? null,
    publicPolicy,
    anonymousListBlocked,
  });
}
