import { capacityReport } from '@research-hub/core/capacity';
import { guardRequest } from '@/lib/guard';

export async function GET() {
  const auth = await guardRequest({ route: 'maintenance' });
  if (!auth.ok) return auth.response;

  try {
    const report = await capacityReport();
    return Response.json(report, {
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch {
    return Response.json({ error: 'capacity_unavailable' }, { status: 503 });
  }
}
