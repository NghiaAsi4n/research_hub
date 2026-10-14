import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnv } from './env';

// Neon Object Storage là S3-compatible, dùng chung endpoint/credential của project Neon.
// File đi thẳng từ trình duyệt lên bucket bằng URL ký sẵn, không qua function
// (giới hạn body 4.5 MB của Vercel Hobby).

export const UPLOAD_URL_TTL_SECONDS = 300;
export const MULTIPART_THRESHOLD_BYTES = 4_500_000;
export const MULTIPART_PART_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_MULTIPART_PARTS = Math.ceil(MAX_UPLOAD_BYTES / MULTIPART_PART_BYTES);

export function uploadPartCount(bytes: number): number | null {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_UPLOAD_BYTES) return null;
  return Math.ceil(bytes / MULTIPART_PART_BYTES);
}

function createClient(): S3Client {
  const env = getEnv();
  if (!env.AWS_ENDPOINT_URL_S3 || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new Error(
      'Thiếu credential Object Storage: chạy `neon link` để Neon đẩy AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY vào .env.local',
    );
  }
  return new S3Client({
    endpoint: env.AWS_ENDPOINT_URL_S3,
    region: env.AWS_REGION ?? 'aws-ap-southeast-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

let cachedClient: S3Client | null = null;

function client(): S3Client {
  if (cachedClient === null) {
    cachedClient = createClient();
  }
  return cachedClient;
}

function bucketName(): string {
  const bucket = getEnv().OBJECT_STORAGE_BUCKET;
  if (!bucket) {
    throw new Error('Thiếu OBJECT_STORAGE_BUCKET');
  }
  return bucket;
}

export function presignUpload(
  key: string,
  contentType: string,
  expiresIn = UPLOAD_URL_TTL_SECONDS,
) {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucketName(), Key: key, ContentType: contentType }),
    { expiresIn },
  );
}

export function presignDownload(key: string, expiresIn = UPLOAD_URL_TTL_SECONDS) {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucketName(), Key: key }), {
    expiresIn,
  });
}

export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const result = await client().send(
    new CreateMultipartUploadCommand({
      Bucket: bucketName(),
      Key: key,
      ContentType: contentType,
    }),
  );
  if (!result.UploadId) throw new Error('Object Storage did not return an upload ID');
  return result.UploadId;
}

export function presignMultipartPart(key: string, uploadId: string, partNumber: number) {
  return getSignedUrl(
    client(),
    new UploadPartCommand({
      Bucket: bucketName(),
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
}

export async function listMultipartParts(key: string, uploadId: string) {
  const response = await client().send(
    new ListPartsCommand({
      Bucket: bucketName(),
      Key: key,
      UploadId: uploadId,
      MaxParts: MAX_MULTIPART_PARTS,
    }),
  );
  return response.Parts ?? [];
}

export async function objectSize(key: string): Promise<number | undefined> {
  const response = await client().send(new HeadObjectCommand({ Bucket: bucketName(), Key: key }));
  return response.ContentLength;
}

export function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
) {
  return client().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucketName(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
      },
    }),
  );
}

export function abortMultipartUpload(key: string, uploadId: string) {
  return client().send(
    new AbortMultipartUploadCommand({
      Bucket: bucketName(),
      Key: key,
      UploadId: uploadId,
    }),
  );
}

// Ghi thẳng một object từ function hoặc pipeline: dùng cho bản Markdown sạch của T4/T5.
export function putObject(key: string, body: string | Uint8Array, contentType: string) {
  return client().send(
    new PutObjectCommand({ Bucket: bucketName(), Key: key, Body: body, ContentType: contentType }),
  );
}

// Đọc trọn một object thành mảng byte: fetcher PDF (T5) cần cả file trước khi trích lớp văn bản.
// T7 thay đường này bằng luồng khi cần file lớn hơn.
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const response = await client().send(new GetObjectCommand({ Bucket: bucketName(), Key: key }));
  if (response.Body === undefined) {
    throw new Error(`Object rỗng: ${key}`);
  }
  return response.Body.transformToByteArray();
}

// Xoá object: dùng để dọn file kiểm chứng và, về sau, dọn bản ghi hỏng.
export function deleteObject(key: string) {
  return client().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
}

// Quy ước khoá: <kind>/<yyyy>/<mm>/<uuid>.<ext> cho file gốc,
// và <cùng khoá>.md cho bản Markdown sạch.
export function buildStorageKey(kind: string, filename: string, now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safeName = filename.replace(/[^\w.-]+/g, '_').slice(-80);
  return `${kind}/${year}/${month}/${crypto.randomUUID()}-${safeName}`;
}

// Khoá của bản Markdown sạch: cùng khoá với file gốc, thêm đuôi `.md` (T4, T5 ghi vào đây).
export function markdownKeyFor(storageKey: string): string {
  return `${storageKey}.md`;
}
