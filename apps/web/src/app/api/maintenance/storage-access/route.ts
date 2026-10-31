import { checkStorageAccess } from '@research-hub/core/storage-access';
import { guardRequest } from '@/lib/guard';

export async function GET() {
  const auth = await guardRequest({ route: 'maintenance' });
  if (!auth.ok) return auth.response;

  try {
    return Response.json(await checkStorageAccess(), {
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch {
    return Response.json({ error: 'storage_check_unavailable' }, { status: 503 });
  }
}
