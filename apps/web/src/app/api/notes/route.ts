import {
  createNoteStore,
  MAX_NOTE_BODY_CHARS,
  MAX_NOTE_TITLE_CHARS,
} from '@research-hub/core/note-store';
import { guardRequest } from '@/lib/guard';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type NotePayload = { title?: unknown; bodyMd?: unknown; docId?: unknown };

function parsePayload(
  raw: unknown,
): { title: string; bodyMd: string; docId: string | null } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const body = raw as NotePayload;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title === '' || title.length > MAX_NOTE_TITLE_CHARS) return null;
  const bodyMd = typeof body.bodyMd === 'string' ? body.bodyMd : '';
  if (bodyMd.length > MAX_NOTE_BODY_CHARS) return null;
  const docId = typeof body.docId === 'string' && UUID_PATTERN.test(body.docId) ? body.docId : null;
  return { title, bodyMd, docId };
}

export async function GET(request: Request) {
  const auth = await guardRequest({ route: 'notes' });
  if (!auth.ok) return auth.response;
  const tag = new URL(request.url).searchParams.get('tag')?.trim() || undefined;
  return Response.json(await createNoteStore().list(tag), {
    headers: { 'cache-control': 'private, no-store' },
  });
}

export async function POST(request: Request) {
  const auth = await guardRequest({ route: 'notes' });
  if (!auth.ok) return auth.response;
  const payload = parsePayload(await request.json().catch(() => null));
  if (payload === null) {
    return Response.json({ error: 'invalid_note' }, { status: 400 });
  }
  const note = await createNoteStore().create(payload);
  return Response.json(note, { status: 201, headers: { 'cache-control': 'private, no-store' } });
}
