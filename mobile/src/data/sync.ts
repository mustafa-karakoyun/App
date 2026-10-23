import type { Book, Loan, Location, SyncChanges, SyncPullResponse, SyncPushResponse, UserBook } from '@kitaplik/shared';
import { eq, inArray, lte } from 'drizzle-orm';
import { useSyncExternalStore } from 'react';
import { db } from '@/db/client';
import { notifyChange } from '@/db/changes';
import { books, loans, locations, outbox, userBooks } from '@/db/schema';
import { api, ApiError, fileFormData, isOffline } from '@/lib/api';
import { currentUser } from '@/lib/auth';
import { getKv, setKv } from './kv';
import { bookIdsWithLocalCover, clearLocalCover, pendingBooks, replaceBookId, upsertCatalogBooks } from './library';
import { ensureReminders } from './loans';

// Yerel öncelikli senkronizasyon: cihazdaki veri her zaman doğru kabul edilir,
// sunucu yedek ve cihazlar arası köprü. Çakışmada son yazan (updated_at) kazanır.

export type SyncStatus = { running: boolean; lastError: string | null; offline: boolean };

let status: SyncStatus = { running: false, lastError: null, offline: false };
const listeners = new Set<() => void>();
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l();
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

export function lastSyncAt(): string | null {
  return getKv('sync.last_success');
}

export function pendingChangeCount(): number {
  return new Set(db.select().from(outbox).all().map((o) => `${o.tableName}:${o.recordId}`)).size;
}

/** Çevrimdışı eklenen kitapları sunucu kataloğuyla eşler. Hesap gerekmez (ISBN araması açık). */
async function resolvePendingBooks() {
  for (const book of pendingBooks()) {
    try {
      if (book.syncState === 'pending_isbn' && book.isbn13) {
        const found = await api<Book>(`/books/isbn/${book.isbn13}`);
        upsertCatalogBooks([found]);
        replaceBookId(book.id, found.id);
      } else if (book.syncState === 'pending_manual' && currentUser()) {
        const created = await api<Book>('/books', {
          method: 'POST',
          body: {
            id: book.id,
            isbn13: book.isbn13,
            title: book.title,
            authors: JSON.parse(book.authors) as string[],
            publisher: book.publisher,
            year: book.year,
            page_count: book.pageCount,
          },
        });
        upsertCatalogBooks([created]);
        replaceBookId(book.id, created.id);
      }
    } catch (err) {
      if (isOffline(err)) throw err;
      // 404: kitap hiçbir kaynakta yok; kullanıcı bilgileri elle girene kadar beklemede kalır.
      if (!(err instanceof ApiError && err.status === 404)) console.warn('Kitap eşlenemedi', err);
    }
  }
}

async function uploadLocalCovers() {
  for (const book of bookIdsWithLocalCover()) {
    try {
      const form = await fileFormData('photo', book.localCoverUri!, 'kapak.jpg');
      const updated = await api<Book>(`/books/${book.id}/cover`, { method: 'POST', form, timeoutMs: 60_000 });
      clearLocalCover(book.id, updated.cover_url);
    } catch (err) {
      if (isOffline(err)) throw err;
      // 403: ortak katalogda kapak zaten var; yerel kapak bu cihazda kalır.
      if (err instanceof ApiError && err.status === 403) clearLocalCover(book.id, book.coverUrl);
    }
  }
}

async function push() {
  const queued = db.select().from(outbox).all();
  if (queued.length === 0) return;
  const maxId = Math.max(...queued.map((q) => q.id));
  const idsFor = (table: string) => [...new Set(queued.filter((q) => q.tableName === table).map((q) => q.recordId))];

  const pendingBookIds = new Set(pendingBooks().map((b) => b.id));
  const locRows = idsFor('locations').length
    ? db.select().from(locations).where(inArray(locations.id, idsFor('locations'))).all()
    : [];
  const ubRows = idsFor('user_books').length
    ? db.select().from(userBooks).where(inArray(userBooks.id, idsFor('user_books'))).all()
    : [];
  const loanRows = idsFor('loans').length ? db.select().from(loans).where(inArray(loans.id, idsFor('loans'))).all() : [];

  // Kitabı henüz sunucuda olmayan kayıtlar bekler; giden kutusunda kalırlar.
  const held = ubRows.filter((u) => pendingBookIds.has(u.bookId)).map((u) => u.id);
  const changes: SyncChanges = {
    locations: locRows.map(
      (r): Location => ({ id: r.id, name: r.name, parent_id: r.parentId, updated_at: r.updatedAt, deleted_at: r.deletedAt }),
    ),
    user_books: ubRows
      .filter((u) => !pendingBookIds.has(u.bookId))
      .map(
        (r): UserBook => ({
          id: r.id,
          book_id: r.bookId,
          status: r.status,
          location_id: r.locationId,
          added_via: r.addedVia,
          created_at: r.createdAt,
          updated_at: r.updatedAt,
          deleted_at: r.deletedAt,
        }),
      ),
    loans: loanRows.map(
      (r): Loan => ({
        id: r.id,
        user_book_id: r.userBookId,
        borrower_name: r.borrowerName,
        lent_at: r.lentAt,
        due_at: r.dueAt,
        returned_at: r.returnedAt,
        updated_at: r.updatedAt,
        deleted_at: r.deletedAt,
      }),
    ),
  };

  await api<SyncPushResponse>('/sync/push', { method: 'POST', body: { changes }, timeoutMs: 60_000 });
  // Reddedilenler sunucuda daha yeni sürümü olanlar; pull onları zaten getirecek.
  db.delete(outbox).where(lte(outbox.id, maxId)).run();
  for (const id of held) db.insert(outbox).values({ tableName: 'user_books', recordId: id, createdAt: new Date().toISOString() }).run();
}

/** Gelen kayıt yalnızca yereldekinden yeniyse ve yerelde gönderilmemiş değişiklik yoksa yazılır. */
function shouldApply(localUpdatedAt: string | undefined, incoming: string, hasPendingLocal: boolean) {
  if (!localUpdatedAt) return true;
  if (hasPendingLocal) return localUpdatedAt < incoming;
  return localUpdatedAt <= incoming;
}

async function pull() {
  const since = getKv('sync.last_pull');
  const res = await api<SyncPullResponse>(`/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ''}`, {
    timeoutMs: 60_000,
  });
  upsertCatalogBooks(res.books);

  const pendingIds = new Set(db.select().from(outbox).all().map((o) => o.recordId));

  db.$client.withTransactionSync(() => {
    for (const r of res.changes.locations) {
      const local = db.select({ u: locations.updatedAt }).from(locations).where(eq(locations.id, r.id)).get();
      if (!shouldApply(local?.u, r.updated_at, pendingIds.has(r.id))) continue;
      const row = { id: r.id, name: r.name, parentId: r.parent_id, updatedAt: r.updated_at, deletedAt: r.deleted_at };
      db.insert(locations).values(row).onConflictDoUpdate({ target: locations.id, set: row }).run();
    }
    for (const r of res.changes.user_books) {
      const local = db.select({ u: userBooks.updatedAt }).from(userBooks).where(eq(userBooks.id, r.id)).get();
      if (!shouldApply(local?.u, r.updated_at, pendingIds.has(r.id))) continue;
      const row = {
        id: r.id,
        bookId: r.book_id,
        status: r.status,
        locationId: r.location_id,
        addedVia: r.added_via,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        deletedAt: r.deleted_at,
      };
      db.insert(userBooks).values(row).onConflictDoUpdate({ target: userBooks.id, set: row }).run();
    }
    for (const r of res.changes.loans) {
      const local = db
        .select({ u: loans.updatedAt })
        .from(loans)
        .where(eq(loans.id, r.id))
        .get();
      if (!shouldApply(local?.u, r.updated_at, pendingIds.has(r.id))) continue;
      const row = {
        id: r.id,
        userBookId: r.user_book_id,
        borrowerName: r.borrower_name,
        lentAt: r.lent_at,
        dueAt: r.due_at,
        returnedAt: r.returned_at,
        updatedAt: r.updated_at,
        deletedAt: r.deleted_at,
      };
      db.insert(loans).values(row).onConflictDoUpdate({ target: loans.id, set: row }).run();
    }
  });

  setKv('sync.last_pull', res.server_time);
  notifyChange('locations', 'user_books', 'loans', 'books');
}

let running: Promise<void> | null = null;

/** Tam senkronizasyon. Aynı anda tek bir tur çalışır; ikinci çağrı ilkini bekler. */
export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    setStatus({ running: true });
    try {
      await resolvePendingBooks();
      if (currentUser()) {
        await uploadLocalCovers();
        await push();
        await pull();
        setKv('sync.last_success', new Date().toISOString());
      }
      setStatus({ lastError: null, offline: false });
      await ensureReminders();
    } catch (err) {
      if (isOffline(err)) setStatus({ offline: true, lastError: null });
      else setStatus({ lastError: (err as Error).message, offline: false });
    } finally {
      setStatus({ running: false });
      running = null;
    }
  })();
  return running;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Yerel değişiklikten birkaç saniye sonra arka planda gönder (art arda değişiklikleri topla). */
export function scheduleSync(delayMs = 4000) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, delayMs);
}

/** Bu cihazdaki tüm kütüphane verisini siler (çıkışta isteğe bağlı). */
export function wipeLocalData() {
  db.$client.withTransactionSync(() => {
    db.delete(outbox).run();
    db.delete(loans).run();
    db.delete(userBooks).run();
    db.delete(locations).run();
    db.delete(books).run();
  });
  setKv('sync.last_pull', null);
  setKv('sync.last_success', null);
  notifyChange('books', 'user_books', 'locations', 'loans');
}
