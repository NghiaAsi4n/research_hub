import { createReaderStore } from '@research-hub/core/reader-store';
import { guardRequest } from '@/lib/guard';

export async function GET(request: Request) {
  const auth = await guardRequest({ route: 'reader' });
  if (!auth.ok) return auth.response;
  const offset = Number(new URL(request.url).searchParams.get('offset') ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000)
    return Response.json({ error: 'invalid_offset' }, { status: 400 });
  return Response.json(await createReaderStore().list(offset), {
    headers: { 'cache-control': 'private, no-store' },
  });
}
