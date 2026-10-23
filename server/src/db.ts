import pg from 'pg';

// timestamptz alanları Date yerine ISO metin olarak dönsün: API sözleşmesi metin.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (v) => new Date(v).toISOString());

export type Db = pg.Pool;

export function createDb(connectionString: string): Db {
  return new pg.Pool({ connectionString, max: 10 });
}

export async function withTransaction<T>(db: Db, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
