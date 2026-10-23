import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { notifyChange } from '@/db/changes';
import { kv } from '@/db/schema';

export function getKv(key: string): string | null {
  return db.select().from(kv).where(eq(kv.key, key)).get()?.value ?? null;
}

export function setKv(key: string, value: string | null) {
  if (value === null) db.delete(kv).where(eq(kv.key, key)).run();
  else db.insert(kv).values({ key, value }).onConflictDoUpdate({ target: kv.key, set: { value } }).run();
  notifyChange('kv');
}
