import { globalSearch, MAX_SEARCH_QUERY_CHARS } from '@research-hub/core/global-search';
import { guardRequest } from '@/lib/guard';

export async function GET(request: Request) {
  const auth = await guardRequest({ route: 'search' });
  if (!auth.ok) return auth.response;

  const query = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (query.length > MAX_SEARCH_QUERY_CHARS) {
    return Response.json({ error: 'query_too_long' }, { status: 400 });
  }

  const hits = await globalSearch({ query });
  return Response.json(
    { query, hits },
    {
      headers: { 'cache-control': 'private, no-store' },
    },
  );
}
