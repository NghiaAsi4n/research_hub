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
export const MAX_OBJECT_RANGE_BYTES = 64 * 1024;

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

type StreamingBody = {
  transformToWebStream(): ReadableStream<Uint8Array>;
};

async function* bodyChunks(body: StreamingBody): AsyncGenerator<Uint8Array> {
  const reader = body.transformToWebStream().getReader();
  let complete = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        complete = true;
        return;
      }
      yield result.value;
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function joinChunks(chunks: Uint8Array[], byteLength: number): Uint8Array {
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

// Đọc một đoạn có giới hạn để pdf.js tra metadata và nội dung theo byte-range, không tải cả PDF.
export async function getObjectRange(
  key: string,
  begin: number,
  end: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const length = end - begin;
  if (
    !Number.isSafeInteger(begin) ||
    begin < 0 ||
    !Number.isSafeInteger(end) ||
    length <= 0 ||
    length > MAX_OBJECT_RANGE_BYTES
  ) {
    throw new RangeError(`Invalid Object Storage range: ${begin}-${end}`);
  }

  const response = await client().send(
    new GetObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Range: `bytes=${begin}-${end - 1}`,
    }),
    signal === undefined ? undefined : { abortSignal: signal },
  );
  if (response.Body === undefined) throw new Error(`Object rỗng: ${key}`);

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for await (const chunk of bodyChunks(response.Body)) {
    byteLength += chunk.byteLength;
    if (byteLength > length)
      throw new Error(`Object Storage trả quá nhiều byte cho range ${begin}-${end}`);
    chunks.push(chunk);
  }
  if (byteLength !== length) {
    throw new Error(
      `Object Storage trả ${byteLength} byte cho range ${begin}-${end}, cần ${length}`,
    );
  }
  return joinChunks(chunks, byteLength);
}

// Trả các chunk thô để ghép Markdown mà không giữ toàn bộ tài liệu trong bộ nhớ.
export async function* getObjectChunks(key: string): AsyncGenerator<Uint8Array> {
  const response = await client().send(new GetObjectCommand({ Bucket: bucketName(), Key: key }));
  if (response.Body === undefined) throw new Error(`Object rỗng: ${key}`);
  yield* bodyChunks(response.Body);
}

// Ghi luồng Markdown với bộ đệm tối đa một part; object lớn hơn được tải lên qua multipart.
export async function putObjectChunks(
  key: string,
  chunks: AsyncIterable<Uint8Array>,
  contentType: string,
): Promise<number> {
  const pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let totalBytes = 0;
  let uploadId: string | undefined;
  const parts: { partNumber: number; etag: string }[] = [];

  const uploadPendingPart = async (partBytes: number): Promise<void> => {
    if (uploadId === undefined) uploadId = await createMultipartUpload(key, contentType);
    if (parts.length >= 10_000) throw new Error('Markdown vượt giới hạn 10.000 multipart parts');
    const partNumber = parts.length + 1;
    const response = await client().send(
      new UploadPartCommand({
        Bucket: bucketName(),
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: joinChunks(pending, partBytes),
      }),
    );
    if (response.ETag === undefined)
      throw new Error(`Object Storage không trả ETag cho part ${partNumber}`);
    parts.push({ partNumber, etag: response.ETag });
    pending.length = 0;
    pendingBytes = 0;
  };

  try {
    for await (const chunk of chunks) {
      totalBytes += chunk.byteLength;
      let offset = 0;
      while (offset < chunk.byteLength) {
        const length = Math.min(MULTIPART_PART_BYTES - pendingBytes, chunk.byteLength - offset);
        pending.push(chunk.subarray(offset, offset + length));
        pendingBytes += length;
        offset += length;
        if (pendingBytes === MULTIPART_PART_BYTES) await uploadPendingPart(pendingBytes);
      }
    }

    if (uploadId === undefined) {
      await client().send(
        new PutObjectCommand({
          Bucket: bucketName(),
          Key: key,
          Body: joinChunks(pending, pendingBytes),
          ContentLength: totalBytes,
          ContentType: contentType,
        }),
      );
      return totalBytes;
    }

    if (pendingBytes > 0) await uploadPendingPart(pendingBytes);
    await completeMultipartUpload(key, uploadId, parts);
    uploadId = undefined;
    return totalBytes;
  } catch (error) {
    if (uploadId !== undefined) await abortMultipartUpload(key, uploadId).catch(() => undefined);
    throw error;
  }
}

// T5's small-file path retains bytes for pdf.js; T7's batch worker uses the range helpers above.
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
