import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

export const sqlite = openDatabaseSync('kitaplik.db');
sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
