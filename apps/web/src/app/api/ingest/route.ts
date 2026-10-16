import { createIngestStore } from '@research-hub/core/ingest-store';
import { createIngestHandler } from '@/lib/ingest-handler';

// Giai đoạn 1 (T3): sau khi ký URL, route còn tạo `sources`, `documents` và `jobs` để pipeline có
// việc cụ thể. File vẫn đi thẳng từ trình duyệt lên Object Storage vì Vercel Hobby giới hạn body
// 4.5 MB. Toàn bộ phần quyết định nằm ở `@/lib/ingest-handler` để test được với store giả.

export const maxDuration = 300;
export const POST = createIngestHandler(createIngestStore());
