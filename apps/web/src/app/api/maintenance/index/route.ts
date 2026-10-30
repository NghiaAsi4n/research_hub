import { getDb } from '@research-hub/core/db/client';
import { createOllamaEmbedder, DEFAULT_EMBED_MODEL } from '@research-hub/core/embed';
import { getEnv } from '@research-hub/core/env';
import { indexDocument, listUnindexedDocumentIds } from '@research-hub/core/index-document';
import { ollamaConfig } from '@/lib/ollama';

// Chia chunk và sinh vector cho tài liệu đã `ready` (Giai đoạn 2, T1 + T2).
//
// Bảo vệ bằng `CRON_SECRET` như route cron và backfill: endpoint này đọc Object Storage và gọi
// nhà cung cấp embedding nên không mở công khai. `?documentId=` xử lý một tài liệu, `?limit=` xử
// lý lô tài liệu chưa có chunk.

export const maxDuration = 300;

function embedder() {
  const { endpoint, apiKey } = ollamaConfig();
  return createOllamaEmbedder({ baseUrl: endpoint, apiKey, model: DEFAULT_EMBED_MODEL });
}

export async function POST(request: Request): Promise<Response> {
  const secret = getEnv().CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const documentId = url.searchParams.get('documentId');
  const limitParam = Number(url.searchParams.get('limit') ?? '');
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : 5;

  const db = getDb();
  const targets = documentId ? [documentId] : await listUnindexedDocumentIds({ db, limit });

  const embed = embedder();
  const reports = [];
  for (const id of targets) {
    reports.push(await indexDocument({ documentId: id, embed, db }));
  }

  return Response.json({ processed: reports.length, reports });
}
