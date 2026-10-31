import { createWatchlistStore } from '@research-hub/core/watchlist-store';
import { guardRequest } from '@/lib/guard';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guardRequest({ route: 'watchlist' });
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return Response.json({ error: 'invalid_id' }, { status: 400 });

  const marked = await createWatchlistStore().markRead(id);
  if (!marked) return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json({ ok: true }, { headers: { 'cache-control': 'private, no-store' } });
}
