import {
  createNoteStore,
  MAX_NOTE_BODY_CHARS,
  MAX_NOTE_TITLE_CHARS,
} from '@research-hub/core/note-store';
import { guardRequest } from '@/lib/guard';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await guardRequest({ route: 'notes' });
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return Response.json({ error: 'invalid_id' }, { status: 400 });

  const note = await createNoteStore().read(id);
  if (note === null) return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json(note, { headers: { 'cache-control': 'private, no-store' } });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await guardRequest({ route: 'notes' });
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return Response.json({ error: 'invalid_id' }, { status: 400 });

  const raw = (await request.json().catch(() => null)) as {
    title?: unknown;
    bodyMd?: unknown;
    docId?: unknown;
  } | null;
  if (raw === null) return Response.json({ error: 'invalid_note' }, { status: 400 });

  const patch: { title?: string; bodyMd?: string; docId?: string | null } = {};
  if (raw.title !== undefined) {
    if (typeof raw.title !== 'string')
      return Response.json({ error: 'invalid_title' }, { status: 400 });
    const title = raw.title.trim();
    if (title === '' || title.length > MAX_NOTE_TITLE_CHARS) {
      return Response.json({ error: 'invalid_title' }, { status: 400 });
    }
    patch.title = title;
  }
  if (raw.bodyMd !== undefined) {
    if (typeof raw.bodyMd !== 'string' || raw.bodyMd.length > MAX_NOTE_BODY_CHARS) {
      return Response.json({ error: 'invalid_body' }, { status: 400 });
    }
    patch.bodyMd = raw.bodyMd;
  }
  if (raw.docId !== undefined) {
    patch.docId = typeof raw.docId === 'string' && UUID_PATTERN.test(raw.docId) ? raw.docId : null;
  }

  const note = await createNoteStore().update(id, patch);
  if (note === null) return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json(note, { headers: { 'cache-control': 'private, no-store' } });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await guardRequest({ route: 'notes' });
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return Response.json({ error: 'invalid_id' }, { status: 400 });

  const removed = await createNoteStore().remove(id);
  if (!removed) return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json({ ok: true }, { headers: { 'cache-control': 'private, no-store' } });
}
