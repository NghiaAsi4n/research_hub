import { createReaderStore } from '@research-hub/core/reader-store';
import { createReaderHandler } from '@/lib/reader-handler';

const handle = createReaderHandler(createReaderStore());
async function route(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(request, (await context.params).id);
}

export { route as GET, route as POST, route as PATCH, route as DELETE };
