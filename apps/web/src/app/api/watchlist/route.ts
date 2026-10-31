import { createWatchlistStore } from '@research-hub/core/watchlist-store';
import { guardRequest } from '@/lib/guard';

export async function GET() {
  const auth = await guardRequest({ route: 'watchlist' });
  if (!auth.ok) return auth.response;

  const store = createWatchlistStore();
  const [entries, changes, notifications] = await Promise.all([
    store.entries(),
    store.changes(),
    store.notifications(),
  ]);
  return Response.json(
    { entries, changes, notifications },
    {
      headers: { 'cache-control': 'private, no-store' },
    },
  );
}

export async function POST(request: Request) {
  const auth = await guardRequest({ route: 'watchlist' });
  if (!auth.ok) return auth.response;

  const raw = (await request.json().catch(() => null)) as {
    query?: unknown;
    sources?: unknown;
  } | null;
  if (raw === null) return Response.json({ error: 'invalid_watchlist' }, { status: 400 });

  const query = typeof raw.query === 'string' ? raw.query.trim().slice(0, 200) : '';
  const sources = Array.isArray(raw.sources)
    ? raw.sources.filter((value): value is string => typeof value === 'string')
    : [];

  try {
    const entry = await createWatchlistStore().add({ query, sources });
    return Response.json(entry, {
      status: 201,
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch {
    return Response.json({ error: 'invalid_sources' }, { status: 400 });
  }
}
