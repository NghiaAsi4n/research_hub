import { getChunkWithDocument } from '@research-hub/core/chunk-store';
import { guardRequest } from '@/lib/guard';

// Trả nội dung một chunk để UI mở đúng đoạn nguồn khi bấm trích dẫn (Giai đoạn 2, T4).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await guardRequest({ route: 'reader' });
  if (!auth.ok) return auth.response;
  if (auth.subject === 'session') return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: 'invalid_id' }, { status: 400 });

  const chunk = await getChunkWithDocument({ id });
  if (!chunk) return Response.json({ error: 'not_found' }, { status: 404 });

  return Response.json(chunk, { headers: { 'cache-control': 'private, no-store' } });
}
