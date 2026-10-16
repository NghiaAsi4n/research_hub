import { createDeduplicatingDocumentStore } from '@research-hub/core/content-store';
import { createPdfJobStore } from '@research-hub/core/ingest-job-store';
import { ingestPdfBatch } from './read/ingest-pdf-batch';

const jobs = createPdfJobStore();
const documents = createDeduplicatingDocumentStore();

async function main() {
  let processed = 0;
  while (true) {
    const job = await jobs.claim();
    if (!job) break;
    const result = await ingestPdfBatch({ job, jobs, documents });
    process.stdout.write(`${job.id}: ${result}\n`);
    processed += 1;
  }
  process.stdout.write(`Processed ${processed} PDF jobs\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
