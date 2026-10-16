import { createDeduplicatingDocumentStore } from '@research-hub/core/content-store';
import { getEnv } from '@research-hub/core/env';
import { createPdfJobStore } from '@research-hub/core/ingest-job-store';
import { ingestPdfBatch } from '@research-hub/pipeline/ingest-pdf-batch';

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const secret = getEnv().CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const jobs = createPdfJobStore();
  const job = await jobs.claim();
  if (!job) return Response.json({ state: 'idle' });
  const outcome = await ingestPdfBatch({
    job,
    jobs,
    documents: createDeduplicatingDocumentStore(),
  });
  return Response.json({ jobId: job.id, outcome });
}
