import { createIngestStore } from '@research-hub/core/ingest-store';
import { createIngestDoneHandler } from '@/lib/ingest-handler';

// Client gọi sau khi PUT xong lên URL ký sẵn: job rời `awaiting_upload` để pipeline nhặt lên.
// 404 khi job không tồn tại hoặc đã báo xong trước đó — gọi lại không sinh việc thứ hai.

export const POST = createIngestDoneHandler(createIngestStore());
