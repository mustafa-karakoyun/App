import {
  normalizeAuthor,
  normalizeText,
  normalizeTitle,
  type AddedVia,
  type Book,
  type ManualBookInput,
  type ReadingStatus,
} from '@kitaplik/shared';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { notifyChange } from '@/db/changes';
import { books, loans, userBooks, type BookRow, type LoanRow, type UserBookRow } from '@/db/schema';
import { cancelReminder } from '@/lib/notifications';
import { descendantIds, locationPaths } from './locations';
import { enqueue, newId, now } from './util';

export interface LibraryItem {
  userBook: UserBookRow;
  book: BookRow;
  authors: string[];
  locationPath: string | null;
  activeLoan: LoanRow | null;
}

export type SortKey = 'recent' | 'title' | 'author';

export interface LibraryFilter {
  search?: string;
  status?: ReadingStatus | null;
  locationId?: string | null;
  /** Yalnızca konumu atanmamış kitaplar. */
  unplaced?: boolean;
  sort?: SortKey;
}

function parseAuthors(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function activeLoansByUserBook(): Map<string, LoanRow> {
  const rows = db
    .select()
    .from(loans)
    .where(and(isNull(loans.returnedAt), isNull(loans.deletedAt)))
    .all();
  return new Map(rows.map((l) => [l.userBookId, l]));
}

/** Kütüphane listesi; arama ve filtreler tamamen cihazda, internetsiz çalışır. */
export function listLibrary(filter: LibraryFilter = {}): LibraryItem[] {
  const rows = db
    .select({ userBook: userBooks, book: books })
    .from(userBooks)
    .innerJoin(books, eq(books.id, userBooks.bookId))
    .where(isNull(userBooks.deletedAt))
    .orderBy(desc(userBooks.createdAt))
    .all();

  const paths = locationPaths();
  const loansMap = activeLoansByUserBook();
  const tokens = normalizeText(filter.search).split(' ').filter(Boolean);
  const isbnQuery = (filter.search ?? '').replace(/[^0-9X]/gi, '');
  const locationIds = filter.locationId ? descendantIds(filter.locationId) : null;

  const items: LibraryItem[] = [];
  for (const { userBook, book } of rows) {
    if (filter.status && userBook.status !== filter.status) continue;
    if (locationIds && !(userBook.locationId && locationIds.has(userBook.locationId))) continue;
    if (filter.unplaced && userBook.locationId && paths.has(userBook.locationId)) continue;
    if (tokens.length) {
      const haystack = `${book.normalizedTitle} ${book.normalizedAuthors} ${normalizeText(book.publisher)}`;
      const isbnHit = isbnQuery.length >= 4 && (book.isbn13 ?? '').includes(isbnQuery);
      if (!isbnHit && !tokens.every((t) => haystack.includes(t))) continue;
    }
    items.push({
      userBook,
      book,
      authors: parseAuthors(book.authors),
      locationPath: userBook.locationId ? (paths.get(userBook.locationId) ?? null) : null,
      activeLoan: loansMap.get(userBook.id) ?? null,
    });
  }

  if (filter.sort === 'title') {
    items.sort((a, b) => a.book.title.localeCompare(b.book.title, 'tr'));
  } else if (filter.sort === 'author') {
    // Soyadına göre: "Sabahattin Ali" → "Ali".
    const key = (i: LibraryItem) => (i.authors[0] ?? '').split(' ').pop() ?? '';
    items.sort((a, b) => key(a).localeCompare(key(b), 'tr') || a.book.title.localeCompare(b.book.title, 'tr'));
  }
  return items;
}

export function getLibraryItem(userBookId: string): LibraryItem | null {
  const row = db
    .select({ userBook: userBooks, book: books })
    .from(userBooks)
    .innerJoin(books, eq(books.id, userBooks.bookId))
    .where(eq(userBooks.id, userBookId))
    .get();
  if (!row) return null;
  const paths = locationPaths();
  return {
    ...row,
    authors: parseAuthors(row.book.authors),
    locationPath: row.userBook.locationId ? (paths.get(row.userBook.locationId) ?? null) : null,
    activeLoan: activeLoansByUserBook().get(row.userBook.id) ?? null,
  };
}

/** "Bu kitap bende var mı?" — çevrimdışı barkod kontrolü. */
export function findOwnedByIsbn(isbn13: string): LibraryItem | null {
  const row = db
    .select({ id: userBooks.id })
    .from(userBooks)
    .innerJoin(books, eq(books.id, userBooks.bookId))
    .where(and(eq(books.isbn13, isbn13), isNull(userBooks.deletedAt)))
    .get();
  return row ? getLibraryItem(row.id) : null;
}

export function findOwnedByBookId(bookId: string): UserBookRow | null {
  return (
    db
      .select()
      .from(userBooks)
      .where(and(eq(userBooks.bookId, bookId), isNull(userBooks.deletedAt)))
      .get() ?? null
  );
}

export function libraryCount(): number {
  return db.select({ id: userBooks.id }).from(userBooks).where(isNull(userBooks.deletedAt)).all().length;
}

function bookToRow(book: Book, existing?: BookRow): BookRow {
  return {
    id: book.id,
    isbn13: book.isbn13,
    title: book.title,
    authors: JSON.stringify(book.authors),
    publisher: book.publisher,
    year: book.year,
    pageCount: book.page_count,
    coverUrl: book.cover_url ?? existing?.coverUrl ?? null,
    localCoverUri: existing?.localCoverUri ?? null,
    source: book.source,
    verified: book.verified,
    normalizedTitle: normalizeTitle(book.title),
    normalizedAuthors: normalizeAuthor(book.authors.join(' ')),
    syncState: 'synced',
    updatedAt: now(),
  };
}

/** Sunucudan gelen katalog satırlarını yerel kopyaya yazar. */
export function upsertCatalogBooks(list: Book[]) {
  if (list.length === 0) return;
  const existing = new Map(
    db
      .select()
      .from(books)
      .where(inArray(books.id, list.map((b) => b.id)))
      .all()
      .map((b) => [b.id, b]),
  );
  for (const book of list) {
    const row = bookToRow(book, existing.get(book.id));
    db.insert(books).values(row).onConflictDoUpdate({ target: books.id, set: row }).run();
  }
  notifyChange('books');
}

export interface AddOptions {
  status?: ReadingStatus;
  locationId?: string | null;
  addedVia: AddedVia;
}

/**
 * Kitabı kütüphaneye ekler. Zaten varsa tekrar eklemez, mevcut kaydı döner.
 * Kitap satırı (katalog) önceden yerelde olmalı.
 */
export function addToLibrary(bookId: string, opts: AddOptions): { userBook: UserBookRow; existed: boolean } {
  const owned = findOwnedByBookId(bookId);
  if (owned) return { userBook: owned, existed: true };
  const t = now();
  const row: UserBookRow = {
    id: newId(),
    bookId,
    status: opts.status ?? 'to_read',
    locationId: opts.locationId ?? null,
    addedVia: opts.addedVia,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  };
  db.insert(userBooks).values(row).run();
  enqueue('user_books', row.id);
  notifyChange('user_books');
  return { userBook: row, existed: false };
}

/** Sunucudan gelen bir kitabı yerel kataloğa yazıp kütüphaneye ekler. */
export function addCatalogBook(book: Book, opts: AddOptions) {
  upsertCatalogBooks([book]);
  return addToLibrary(book.id, opts);
}

/** Çevrimdışı barkod: yalnızca ISBN'le yer tutucu kitap; internet gelince bilgileri dolar. */
export function addPendingIsbn(isbn13: string, opts: AddOptions) {
  const existingBook = db.select().from(books).where(eq(books.isbn13, isbn13)).get();
  if (existingBook) return addToLibrary(existingBook.id, opts);
  const id = newId();
  db.insert(books)
    .values({
      id,
      isbn13,
      title: `ISBN ${isbn13}`,
      authors: '[]',
      source: 'manual',
      verified: false,
      normalizedTitle: isbn13,
      normalizedAuthors: '',
      syncState: 'pending_isbn',
      updatedAt: now(),
    })
    .run();
  notifyChange('books');
  return addToLibrary(id, opts);
}

/** Elle ekleme: kitap önce yerelde oluşur, sunucuya senkronizasyonda aynı id ile gider. */
export function addManualBook(input: ManualBookInput, opts: AddOptions & { localCoverUri?: string | null }) {
  const id = newId();
  db.insert(books)
    .values({
      id,
      isbn13: input.isbn13 ?? null,
      title: input.title.trim(),
      authors: JSON.stringify(input.authors.map((a) => a.trim()).filter(Boolean)),
      publisher: input.publisher?.trim() || null,
      year: input.year ?? null,
      pageCount: input.page_count ?? null,
      localCoverUri: opts.localCoverUri ?? null,
      source: 'manual',
      verified: false,
      normalizedTitle: normalizeTitle(input.title),
      normalizedAuthors: normalizeAuthor(input.authors.join(' ')),
      syncState: 'pending_manual',
      updatedAt: now(),
    })
    .run();
  notifyChange('books');
  return addToLibrary(id, opts);
}

/** Yer tutucu kitabın bilgilerini kullanıcı elle girdiğinde. */
export function completePendingBook(bookId: string, input: ManualBookInput, localCoverUri?: string | null) {
  db.update(books)
    .set({
      title: input.title.trim(),
      authors: JSON.stringify(input.authors.map((a) => a.trim()).filter(Boolean)),
      publisher: input.publisher?.trim() || null,
      year: input.year ?? null,
      pageCount: input.page_count ?? null,
      normalizedTitle: normalizeTitle(input.title),
      normalizedAuthors: normalizeAuthor(input.authors.join(' ')),
      ...(localCoverUri ? { localCoverUri } : {}),
      syncState: 'pending_manual',
      updatedAt: now(),
    })
    .where(eq(books.id, bookId))
    .run();
  notifyChange('books');
}

export function setLocalCover(bookId: string, uri: string) {
  db.update(books).set({ localCoverUri: uri, updatedAt: now() }).where(eq(books.id, bookId)).run();
  notifyChange('books');
}

/** Yerel kitap sunucuda farklı id ile varsa, kullanıcı kayıtlarını o kitaba taşır. */
export function replaceBookId(oldId: string, newId: string) {
  if (oldId === newId) return;
  const affected = db.select().from(userBooks).where(eq(userBooks.bookId, oldId)).all();
  const t = now();
  for (const ub of affected) {
    const duplicate = !ub.deletedAt && findOwnedByBookId(newId);
    if (duplicate) {
      // Aynı kitap iki yoldan eklenmiş: yer tutucu kaydı sil.
      db.update(userBooks).set({ deletedAt: t, updatedAt: t }).where(eq(userBooks.id, ub.id)).run();
    } else {
      db.update(userBooks).set({ bookId: newId, updatedAt: t }).where(eq(userBooks.id, ub.id)).run();
    }
    enqueue('user_books', ub.id);
  }
  db.delete(books).where(eq(books.id, oldId)).run();
  notifyChange('books', 'user_books');
}

export function updateUserBook(id: string, patch: { status?: ReadingStatus; locationId?: string | null }) {
  db.update(userBooks)
    .set({ ...patch, updatedAt: now() })
    .where(eq(userBooks.id, id))
    .run();
  enqueue('user_books', id);
  notifyChange('user_books');
}

export function setLocationForMany(ids: string[], locationId: string | null) {
  if (ids.length === 0) return;
  db.update(userBooks).set({ locationId, updatedAt: now() }).where(inArray(userBooks.id, ids)).run();
  for (const id of ids) enqueue('user_books', id);
  notifyChange('user_books');
}

export async function removeFromLibrary(id: string) {
  const t = now();
  db.update(userBooks).set({ deletedAt: t, updatedAt: t }).where(eq(userBooks.id, id)).run();
  enqueue('user_books', id);
  const open = db
    .select()
    .from(loans)
    .where(and(eq(loans.userBookId, id), isNull(loans.deletedAt)))
    .all();
  for (const loan of open) {
    if (loan.notificationId) await cancelReminder(loan.notificationId);
    db.update(loans).set({ deletedAt: t, updatedAt: t, notificationId: null }).where(eq(loans.id, loan.id)).run();
    enqueue('loans', loan.id);
  }
  notifyChange('user_books', 'loans');
}

export function pendingBooks(): BookRow[] {
  return db
    .select()
    .from(books)
    .where(inArray(books.syncState, ['pending_isbn', 'pending_manual']))
    .all();
}

export function bookIdsWithLocalCover(): BookRow[] {
  return db.select().from(books).all().filter((b) => b.localCoverUri && b.syncState === 'synced');
}

export function clearLocalCover(bookId: string, coverUrl: string | null) {
  db.update(books).set({ localCoverUri: null, coverUrl, updatedAt: now() }).where(eq(books.id, bookId)).run();
  notifyChange('books');
}

export function statusCounts(): Record<ReadingStatus | 'all', number> {
  const rows = db.select({ status: userBooks.status }).from(userBooks).where(isNull(userBooks.deletedAt)).all();
  const counts = { all: rows.length, to_read: 0, reading: 0, read: 0, abandoned: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
}
