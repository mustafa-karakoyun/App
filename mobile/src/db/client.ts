import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync, openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import * as schema from './schema';

const NAME = 'kitaplik.db';

function create(sqlite: SQLiteDatabase) {
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof create>;

let instance: Db | null = null;

function open() {
  const sqlite = openDatabaseSync(NAME);
  // Web önizlemesindeki SQLite (OPFS) WAL kipini desteklemiyor.
  if (Platform.OS !== 'web') sqlite.execSync('PRAGMA journal_mode = WAL;');
  instance = create(sqlite);
}

// Telefonda veri tabanı hemen açılır. Web önizlemesinde senkron çağrılar, işçi
// (worker) hazır olmadan zaman aşımına uğruyor; önce eşzamansız açılıp ısıtılır.
if (Platform.OS !== 'web') open();

export async function ensureDb(): Promise<void> {
  if (instance) return;
  const warm = await openDatabaseAsync(NAME);
  await warm.getFirstAsync('SELECT 1');
  open();
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    if (!instance) throw new Error('Veri tabanı henüz açılmadı');
    const value = Reflect.get(instance, prop, instance);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
