import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { notifyChange } from '@/db/changes';
import { books, loans, userBooks, type BookRow, type LoanRow } from '@/db/schema';
import { cancelReminder, scheduleLoanReminder } from '@/lib/notifications';
import { enqueue, newId, now } from './util';

export interface LoanItem {
  loan: LoanRow;
  book: BookRow;
  userBookId: string;
}

/** Ödünçteki kitaplar: iade tarihi geçenler en üstte, sonra yaklaşan tarih, tarihsizler en sonda. */
export function activeLoans(): LoanItem[] {
  const rows = db
    .select({ loan: loans, book: books, userBookId: userBooks.id })
    .from(loans)
    .innerJoin(userBooks, eq(userBooks.id, loans.userBookId))
    .innerJoin(books, eq(books.id, userBooks.bookId))
    .where(and(isNull(loans.returnedAt), isNull(loans.deletedAt), isNull(userBooks.deletedAt)))
    .all();
  return rows.sort((a, b) => {
    const da = a.loan.dueAt ? new Date(a.loan.dueAt).getTime() : Infinity;
    const dbb = b.loan.dueAt ? new Date(b.loan.dueAt).getTime() : Infinity;
    return da - dbb || a.loan.lentAt.localeCompare(b.loan.lentAt);
  });
}

export function returnedLoans(limit = 20): LoanItem[] {
  return db
    .select({ loan: loans, book: books, userBookId: userBooks.id })
    .from(loans)
    .innerJoin(userBooks, eq(userBooks.id, loans.userBookId))
    .innerJoin(books, eq(books.id, userBooks.bookId))
    .where(and(isNull(loans.deletedAt), isNull(userBooks.deletedAt)))
    .orderBy(desc(loans.returnedAt))
    .all()
    .filter((r) => r.loan.returnedAt)
    .slice(0, limit);
}

/** Daha önce ödünç verilen kişiler: hızlı seçim için, en sık olan başta. */
export function recentBorrowers(limit = 6): string[] {
  const rows = db.select({ name: loans.borrowerName }).from(loans).where(isNull(loans.deletedAt)).all();
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([n]) => n);
}

export async function lendBook(userBookId: string, borrowerName: string, dueAt: string | null): Promise<LoanRow> {
  const t = now();
  const row: LoanRow = {
    id: newId(),
    userBookId,
    borrowerName: borrowerName.trim(),
    lentAt: t,
    dueAt,
    returnedAt: null,
    updatedAt: t,
    deletedAt: null,
    notificationId: null,
  };
  db.insert(loans).values(row).run();
  enqueue('loans', row.id);
  notifyChange('loans');

  if (dueAt) {
    const book = db
      .select({ title: books.title })
      .from(userBooks)
      .innerJoin(books, eq(books.id, userBooks.bookId))
      .where(eq(userBooks.id, userBookId))
      .get();
    const notificationId = await scheduleLoanReminder({
      dueAt,
      bookTitle: book?.title ?? 'kitap',
      borrower: row.borrowerName,
      userBookId,
    });
    if (notificationId) {
      db.update(loans).set({ notificationId }).where(eq(loans.id, row.id)).run();
      row.notificationId = notificationId;
    }
  }
  return row;
}

export async function returnLoan(loanId: string) {
  const loan = db.select().from(loans).where(eq(loans.id, loanId)).get();
  if (!loan) return;
  if (loan.notificationId) await cancelReminder(loan.notificationId);
  const t = now();
  db.update(loans).set({ returnedAt: t, updatedAt: t, notificationId: null }).where(eq(loans.id, loanId)).run();
  enqueue('loans', loanId);
  notifyChange('loans');
}

/**
 * Hatırlatmaları kayıtlarla eşitler: başka cihazdan gelen açık ödünçlere hatırlatma
 * kurar, başka cihazda iade edilen ya da silinenlerin hatırlatmasını iptal eder.
 */
export async function ensureReminders() {
  const stale = db
    .select({
      id: loans.id,
      notificationId: loans.notificationId,
      returnedAt: loans.returnedAt,
      deletedAt: loans.deletedAt,
    })
    .from(loans)
    .all()
    .filter((l) => l.notificationId && (l.returnedAt || l.deletedAt));
  for (const l of stale) {
    await cancelReminder(l.notificationId!);
    db.update(loans).set({ notificationId: null }).where(eq(loans.id, l.id)).run();
  }

  const open = activeLoans().filter((l) => l.loan.dueAt && !l.loan.notificationId);
  for (const { loan, book, userBookId } of open) {
    const id = await scheduleLoanReminder({
      dueAt: loan.dueAt!,
      bookTitle: book.title,
      borrower: loan.borrowerName,
      userBookId,
    });
    if (id) db.update(loans).set({ notificationId: id }).where(eq(loans.id, loan.id)).run();
  }
}
