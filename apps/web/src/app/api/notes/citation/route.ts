import { createNoteStore } from '@research-hub/core/note-store';
import { guardRequest } from '@/lib/guard';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Chèn trích dẫn từ chat: client chỉ gửi `chunkId`, đoạn trích đọc lại từ DB nên không thể sửa.
export async function POST(request: Request) {
  const auth = await guardRequest({ route: 'notes' });
  if (!auth.ok) return auth.response;

  const raw = (await request.json().catch(() => null)) as { chunkId?: unknown } | null;
  const chunkId = typeof raw?.chunkId === 'string' ? raw.chunkId : '';
  if (!UUID_PATTERN.test(chunkId)) {
    return Response.json({ error: 'invalid_chunk' }, { status: 400 });
  }

  const note = await createNoteStore().createFromChunk(chunkId);
  if (note === null) return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json(note, { status: 201, headers: { 'cache-control': 'private, no-store' } });
}
