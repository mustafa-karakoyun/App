import { normalizeText, type NoteKind } from '@kitaplik/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { notifyChange } from '@/db/changes';
import { books, notes, userBooks, type BookRow, type NoteRow } from '@/db/schema';
import { enqueue, newId, now } from './util';

export const NOTE_MAX_LENGTH = 1000;

export function notesForBook(userBookId: string, opts: { kind?: NoteKind | null; byPage?: boolean } = {}): NoteRow[] {
  const rows = db
    .select()
    .from(notes)
    .where(and(eq(notes.userBookId, userBookId), isNull(notes.deletedAt)))
    .orderBy(desc(notes.createdAt))
    .all()
    .filter((n) => !opts.kind || n.kind === opts.kind);
  if (opts.byPage) {
    // Sayfası olmayanlar sona; aynı sayfadakiler eklenme sırasıyla.
    rows.sort((a, b) => (a.page ?? Infinity) - (b.page ?? Infinity) || a.createdAt.localeCompare(b.createdAt));
  }
  return rows;
}

export function noteCounts(userBookId: string): { quote: number; note: number } {
  const rows = notesForBook(userBookId);
  return { quote: rows.filter((n) => n.kind === 'quote').length, note: rows.filter((n) => n.kind === 'note').length };
}

export function getNote(id: string): NoteRow | null {
  return db.select().from(notes).where(eq(notes.id, id)).get() ?? null;
}

export function addNote(userBookId: string, input: { kind: NoteKind; text: string; page: number | null }): NoteRow {
  const t = now();
  const row: NoteRow = {
    id: newId(),
    userBookId,
    kind: input.kind,
    text: input.text.trim().slice(0, NOTE_MAX_LENGTH),
    page: input.page,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  };
  db.insert(notes).values(row).run();
  enqueue('notes', row.id);
  notifyChange('notes');
  return row;
}

export function updateNote(id: string, input: { kind: NoteKind; text: string; page: number | null }) {
  db.update(notes)
    .set({ kind: input.kind, text: input.text.trim().slice(0, NOTE_MAX_LENGTH), page: input.page, updatedAt: now() })
    .where(eq(notes.id, id))
    .run();
  enqueue('notes', id);
  notifyChange('notes');
}

export function deleteNote(id: string) {
  const t = now();
  db.update(notes).set({ deletedAt: t, updatedAt: t }).where(eq(notes.id, id)).run();
  enqueue('notes', id);
  notifyChange('notes');
}

/** "Geri al" için silinen notu geri getirir. */
export function restoreNote(id: string) {
  db.update(notes).set({ deletedAt: null, updatedAt: now() }).where(eq(notes.id, id)).run();
  enqueue('notes', id);
  notifyChange('notes');
}

export interface NoteWithBook {
  note: NoteRow;
  book: BookRow;
  userBookId: string;
}

function liveNotesWithBooks(): NoteWithBook[] {
  return db
    .select({ note: notes, book: books, userBookId: userBooks.id })
    .from(notes)
    .innerJoin(userBooks, eq(userBooks.id, notes.userBookId))
    .innerJoin(books, eq(books.id, userBooks.bookId))
    .where(and(isNull(notes.deletedAt), isNull(userBooks.deletedAt)))
    .orderBy(desc(notes.createdAt))
    .all();
}

/** Metninde aranan kelimelerin hepsi geçen alıntı ve notlar (internetsiz). */
export function searchNotes(query: string, limit = 20): NoteWithBook[] {
  const tokens = normalizeText(query).split(' ').filter(Boolean);
  if (!tokens.length) return [];
  return liveNotesWithBooks()
    .filter((r) => {
      const hay = normalizeText(r.note.text);
      return tokens.every((t) => hay.includes(t));
    })
    .slice(0, limit);
}

export interface BookNotesGroup {
  userBookId: string;
  book: BookRow;
  authors: string[];
  count: number;
  latest: NoteRow;
}

/** Profil › Alıntılar ve notlar: kitap başına grup, en son eklenen kitap başta. */
export function notesByBook(query = ''): { groups: BookNotesGroup[]; total: number } {
  const tokens = normalizeText(query).split(' ').filter(Boolean);
  const rows = liveNotesWithBooks();
  const groups = new Map<string, BookNotesGroup>();
  let total = 0;
  for (const r of rows) {
    if (tokens.length) {
      const hay = `${normalizeText(r.note.text)} ${r.book.normalizedTitle} ${r.book.normalizedAuthors}`;
      if (!tokens.every((t) => hay.includes(t))) continue;
    }
    total++;
    const g = groups.get(r.userBookId);
    // Önizlemede alıntı nota tercih edilir.
    if (g) {
      g.count++;
      if (g.latest.kind !== 'quote' && r.note.kind === 'quote') g.latest = r.note;
    } else {
      let authors: string[] = [];
      try {
        authors = JSON.parse(r.book.authors);
      } catch {
        // Bozuk kayıt: yazar boş kalsın.
      }
      groups.set(r.userBookId, { userBookId: r.userBookId, book: r.book, authors, count: 1, latest: r.note });
    }
  }
  return { groups: [...groups.values()], total };
}

/** Notu olan kullanıcı kitaplarının id'leri ("Alıntısı olanlar" filtresi). */
export function userBooksWithQuotes(): Set<string> {
  return new Set(
    liveNotesWithBooks()
      .filter((r) => r.note.kind === 'quote')
      .map((r) => r.userBookId),
  );
}

/** Kitap kütüphaneden çıkarılınca notları da silinir (yedekten de). */
export function deleteNotesForBook(userBookId: string) {
  const t = now();
  const rows = db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.userBookId, userBookId), isNull(notes.deletedAt)))
    .all();
  for (const r of rows) {
    db.update(notes).set({ deletedAt: t, updatedAt: t }).where(eq(notes.id, r.id)).run();
    enqueue('notes', r.id);
  }
  if (rows.length) notifyChange('notes');
}
