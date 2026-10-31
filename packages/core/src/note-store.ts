import { desc, eq, sql } from 'drizzle-orm';
import { type Db, getDb } from './db/client';
import { chunks, documents, noteLinks, notes } from './db/schema';

// Ghi chú Markdown có liên kết hai chiều (Giai đoạn 4, T1).
//
// Liên kết viết dạng `[[Tiêu đề ghi chú]]`, tag viết dạng `#tag` trong thân bài. Cả hai đều
// suy ra từ nội dung mỗi lần lưu, nên không có bảng phụ nào phải đồng bộ tay.

export const MAX_NOTE_TITLE_CHARS = 200;
export const MAX_NOTE_BODY_CHARS = 200_000;
export const MAX_NOTE_LINKS = 100;

export type NoteRef = { id: string; title: string };

export type NoteSummary = {
  id: string;
  title: string;
  tags: string[];
  docId: string | null;
  updatedAt: Date;
};

export type StoredNote = NoteSummary & {
  bodyMd: string;
  createdAt: Date;
  outgoing: NoteRef[];
  backlinks: NoteRef[];
};

const LINK_PATTERN = /\[\[([^[\]\n]{1,120})\]\]/g;
const TAG_PATTERN = /(^|[^\p{L}\p{N}#])#([\p{L}\p{N}_-]{1,32})/gu;

// Bỏ qua khối mã: `#` trong code không phải tag.
function proseLines(bodyMd: string): string[] {
  const kept: string[] = [];
  let fenced = false;
  for (const line of bodyMd.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) kept.push(line);
  }
  return kept;
}

export function noteLinkTitles(bodyMd: string): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const match of proseLines(bodyMd).join('\n').matchAll(LINK_PATTERN)) {
    const title = match[1]?.trim() ?? '';
    if (title === '') continue;
    const key = title.toLocaleLowerCase('vi');
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
    if (titles.length >= MAX_NOTE_LINKS) break;
  }
  return titles;
}

export function noteTags(bodyMd: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const line of proseLines(bodyMd)) {
    for (const match of line.matchAll(TAG_PATTERN)) {
      const tag = (match[2] ?? '').toLocaleLowerCase('vi');
      // `#123` là số thứ tự, không phải tag.
      if (tag === '' || !/\p{L}/u.test(tag) || seen.has(tag)) continue;
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

export function normalizeTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_TITLE_CHARS);
}

export function createNoteStore(db?: Db) {
  const handle = () => (db ??= getDb());

  const syncLinks = async (noteId: string, titles: string[]): Promise<void> => {
    const database = handle();
    await database.delete(noteLinks).where(eq(noteLinks.fromNote, noteId));
    for (const title of titles) {
      const [target] = await database
        .select({ id: notes.id })
        .from(notes)
        .where(sql`lower(${notes.title}) = lower(${title})`)
        .limit(1);
      if (target === undefined || target.id === noteId) continue;
      await database
        .insert(noteLinks)
        .values({ fromNote: noteId, toNote: target.id })
        .onConflictDoNothing();
    }
  };

  const read = async (id: string): Promise<StoredNote | null> => {
    const database = handle();
    const [note] = await database
      .select({
        id: notes.id,
        title: notes.title,
        bodyMd: notes.bodyMd,
        docId: notes.docId,
        tags: notes.tags,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(eq(notes.id, id));
    if (note === undefined) return null;

    const [outgoing, backlinks] = await Promise.all([
      database
        .select({ id: notes.id, title: notes.title })
        .from(noteLinks)
        .innerJoin(notes, eq(noteLinks.toNote, notes.id))
        .where(eq(noteLinks.fromNote, id))
        .orderBy(notes.title),
      database
        .select({ id: notes.id, title: notes.title })
        .from(noteLinks)
        .innerJoin(notes, eq(noteLinks.fromNote, notes.id))
        .where(eq(noteLinks.toNote, id))
        .orderBy(notes.title),
    ]);

    return { ...note, outgoing, backlinks };
  };

  const save = async (
    id: string,
    input: { title?: string; bodyMd?: string; docId?: string | null },
  ): Promise<StoredNote | null> => {
    const database = handle();
    const [existing] = await database.select({ id: notes.id }).from(notes).where(eq(notes.id, id));
    if (existing === undefined) return null;

    const patch: Partial<typeof notes.$inferInsert> = { updatedAt: new Date() };
    if (input.title !== undefined) patch.title = normalizeTitle(input.title);
    if (input.bodyMd !== undefined) {
      patch.bodyMd = input.bodyMd.slice(0, MAX_NOTE_BODY_CHARS);
      patch.tags = noteTags(patch.bodyMd);
    }
    if (input.docId !== undefined) patch.docId = input.docId;

    await database.update(notes).set(patch).where(eq(notes.id, id));
    if (patch.bodyMd !== undefined) {
      await syncLinks(id, noteLinkTitles(patch.bodyMd));
    }
    return read(id);
  };

  const createNote = async (input: {
    title: string;
    bodyMd?: string;
    docId?: string | null;
  }): Promise<StoredNote> => {
    const title = normalizeTitle(input.title);
    if (title === '') throw new Error('Tiêu đề ghi chú không được để trống');
    const bodyMd = (input.bodyMd ?? '').slice(0, MAX_NOTE_BODY_CHARS);
    const [row] = await handle()
      .insert(notes)
      .values({ title, bodyMd, tags: noteTags(bodyMd), docId: input.docId ?? null })
      .returning({ id: notes.id });
    if (row === undefined) throw new Error('Không tạo được ghi chú');
    await syncLinks(row.id, noteLinkTitles(bodyMd));
    const stored = await read(row.id);
    if (stored === null) throw new Error('Không đọc lại được ghi chú vừa tạo');
    return stored;
  };

  return {
    async list(tag?: string): Promise<NoteSummary[]> {
      const selected = handle()
        .select({
          id: notes.id,
          title: notes.title,
          tags: notes.tags,
          docId: notes.docId,
          updatedAt: notes.updatedAt,
        })
        .from(notes);
      const filtered =
        tag === undefined
          ? selected
          : selected.where(sql`${notes.tags} @> ${JSON.stringify([tag])}::jsonb`);
      return filtered.orderBy(desc(notes.updatedAt), desc(notes.createdAt)).limit(200);
    },

    read,

    create: createNote,

    update: save,

    async remove(id: string): Promise<boolean> {
      const rows = await handle().delete(notes).where(eq(notes.id, id)).returning({ id: notes.id });
      return rows.length > 0;
    },

    // Chèn một trích dẫn từ chat thành ghi chú mới: đoạn trích lấy từ DB, không nhận từ client.
    async createFromChunk(chunkId: string): Promise<StoredNote | null> {
      const database = handle();
      const [row] = await database
        .select({
          chunkId: chunks.id,
          ord: chunks.ord,
          text: chunks.text,
          docId: documents.id,
          documentTitle: documents.title,
        })
        .from(chunks)
        .innerJoin(documents, eq(chunks.documentId, documents.id))
        .where(eq(chunks.id, chunkId));
      if (row === undefined) return null;

      const quote = row.text.replace(/\s+/g, ' ').trim().slice(0, 2000);
      const documentTitle = row.documentTitle ?? 'Tài liệu';
      const bodyMd = [
        `> ${quote}`,
        '',
        `Nguồn: [${documentTitle}](/library/${row.docId}) — đoạn ${row.ord + 1}`,
        '',
        '#trích-dẫn',
      ].join('\n');
      return createNote({
        title: `Trích dẫn — ${documentTitle}`.slice(0, MAX_NOTE_TITLE_CHARS),
        bodyMd,
        docId: row.docId,
      });
    },
  };
}

export type NoteStore = ReturnType<typeof createNoteStore>;
