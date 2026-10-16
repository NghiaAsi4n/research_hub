import { documentIdSchema, highlightSchema, progressSchema } from '@research-hub/core/reader';
import type { ReaderStore } from '@research-hub/core/reader-store';
import { getObjectChunks, markdownKeyFor } from '@research-hub/core/storage';
import { guardRequest } from './guard';

const headers = { 'cache-control': 'private, no-store' };
export function createReaderHandler(store: ReaderStore) {
  return async (request: Request, id: string): Promise<Response> => {
    const auth = await guardRequest({ route: 'reader' });
    if (!auth.ok) return auth.response;
    if (auth.subject === 'session')
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (!documentIdSchema.safeParse(id).success)
      return Response.json({ error: 'invalid_id' }, { status: 400 });
    const origin = request.headers.get('origin');
    if (request.method !== 'GET' && origin && origin !== new URL(request.url).origin)
      return Response.json({ error: 'forbidden' }, { status: 403 });
    const document = await store.get(id, auth.subject);
    if (!document) return Response.json({ error: 'not_found' }, { status: 404 });
    if (request.method === 'GET') {
      if (new URL(request.url).searchParams.get('format') === 'markdown') {
        if (document.status !== 'ready')
          return Response.json({ error: 'not_ready' }, { status: 409 });
        const chunks = getObjectChunks(markdownKeyFor(document.storageKey));
        const body = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const next = await chunks.next();
              if (next.done) controller.close();
              else controller.enqueue(next.value);
            } catch (error) {
              controller.error(error);
            }
          },
          async cancel() {
            await chunks.return(undefined);
          },
        });
        return new Response(body, {
          headers: {
            ...headers,
            'content-type': 'text/markdown; charset=utf-8',
            'x-content-type-options': 'nosniff',
          },
        });
      }
      const { storageKey: _, ...publicDocument } = document;
      return Response.json(publicDocument, { headers });
    }
    if (document.status !== 'ready') return Response.json({ error: 'not_ready' }, { status: 409 });
    const body: unknown = await request.json().catch(() => null);
    if (request.method === 'PATCH') {
      const parsed = progressSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: 'invalid_progress' }, { status: 400 });
      await store.saveProgress(document.id, auth.subject, parsed.data);
      return new Response(null, { status: 204, headers });
    }
    if (request.method === 'POST') {
      const parsed = highlightSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: 'invalid_highlight' }, { status: 400 });
      return Response.json(await store.addHighlight(document.id, auth.subject, parsed.data), {
        status: 201,
        headers,
      });
    }
    if (request.method === 'DELETE') {
      const parsed = documentIdSchema.safeParse((body as { id?: unknown } | null)?.id);
      if (!parsed.success) return Response.json({ error: 'invalid_id' }, { status: 400 });
      await store.removeHighlight(document.id, auth.subject, parsed.data);
      return new Response(null, { status: 204, headers });
    }
    return new Response(null, { status: 405 });
  };
}
