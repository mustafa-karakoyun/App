import { randomUUID } from 'expo-crypto';
import { db } from '@/db/client';
import { outbox } from '@/db/schema';

export const now = () => new Date().toISOString();
export const newId = () => randomUUID();

export type SyncTable = 'locations' | 'user_books' | 'loans' | 'notes';

/** Değişen kaydı giden kutusuna yazar; senkronizasyon kaydın son halini gönderir. */
export function enqueue(table: SyncTable, recordId: string) {
  db.insert(outbox).values({ tableName: table, recordId, createdAt: now() }).run();
}
