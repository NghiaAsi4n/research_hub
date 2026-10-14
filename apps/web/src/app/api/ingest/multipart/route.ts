import { createIngestStore } from '@research-hub/core/ingest-store';
import { createMultipartHandler } from '@/lib/ingest-handler';

export const POST = createMultipartHandler(createIngestStore());
