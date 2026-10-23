import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db';

const here = path.dirname(fileURLToPath(import.meta.url));
// Hem src/ (tsx) hem dist/ (derlenmiş) altından çalıştığında migrations/ bir üst klasörde.
const MIGRATIONS_DIR = path.resolve(here, '..', 'migrations');

/** migrations/ klasöründeki henüz uygulanmamış .sql dosyalarını sırayla çalıştırır. */
export async function migrate(db: Db, log: (msg: string) => void = () => {}): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const applied = new Set(
    (await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
  );
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`Uygulandı: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`${file} uygulanamadı: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { loadConfig } = await import('./config');
  const { createDb } = await import('./db');
  const db = createDb(loadConfig().DATABASE_URL);
  await migrate(db, console.log);
  await db.end();
  console.log('Veri tabanı güncel.');
}
