import { db } from '@/db/client';
import { notifyChange } from '@/db/changes';
import { books, loans, locations, notes, outbox, pendingScans, userBooks } from '@/db/schema';
import { cancelReminder } from '@/lib/notifications';
import { setKv } from './kv';

/** Bu cihazdaki tüm kütüphane verisini siler (hesap silme, hesap değiştirme). */
export async function wipeLocalData() {
  const reminders = db.select({ id: loans.notificationId }).from(loans).all();
  for (const r of reminders) if (r.id) await cancelReminder(r.id);
  db.$client.withTransactionSync(() => {
    db.delete(outbox).run();
    db.delete(loans).run();
    db.delete(notes).run();
    db.delete(userBooks).run();
    db.delete(locations).run();
    db.delete(books).run();
    db.delete(pendingScans).run();
  });
  setKv('sync.last_pull', null);
  setKv('sync.last_success', null);
  notifyChange('books', 'user_books', 'locations', 'loans', 'notes', 'pending_scans');
}
