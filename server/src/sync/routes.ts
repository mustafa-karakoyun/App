import { ADDED_VIA, READING_STATUSES, type SyncPullResponse, type SyncPushResponse } from '@kitaplik/shared';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { getBooks } from '../books/catalog';
import { withTransaction } from '../db';

const isoDate = z.iso.datetime({ offset: true });
const synced = { id: z.uuid(), updated_at: isoDate, deleted_at: isoDate.nullable() };

const pushSchema = z.object({
  changes: z.object({
    locations: z
      .array(z.object({ ...synced, name: z.string().trim().min(1).max(100), parent_id: z.uuid().nullable() }))
      .max(2000)
      .default([]),
    user_books: z
      .array(
        z.object({
          ...synced,
          book_id: z.uuid(),
          status: z.enum(READING_STATUSES),
          location_id: z.uuid().nullable(),
          added_via: z.enum(ADDED_VIA),
          created_at: isoDate,
        }),
      )
      .max(5000)
      .default([]),
    loans: z
      .array(
        z.object({
          ...synced,
          user_book_id: z.uuid(),
          borrower_name: z.string().trim().min(1).max(100),
          lent_at: isoDate,
          due_at: isoDate.nullable(),
          returned_at: isoDate.nullable(),
        }),
      )
      .max(5000)
      .default([]),
  }),
});

/**
 * Son yazan kazanır: kayıt yalnızca gelen updated_at daha yeniyse güncellenir.
 * Başka kullanıcıya ait aynı id'li kayıt asla değişmez. Dönen id'ler kabul edilenler.
 */
async function upsert(
  client: pg.PoolClient,
  table: 'locations' | 'user_books' | 'loans',
  userId: string,
  columns: string[],
  rows: Record<string, unknown>[],
): Promise<Set<string>> {
  const accepted = new Set<string>();
  if (rows.length === 0) return accepted;
  const all = ['id', 'user_id', ...columns, 'updated_at', 'deleted_at'];
  const updates = [...columns, 'updated_at', 'deleted_at'].map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  // Büyük ilk senkronizasyonları parça parça yaz; tek sorguda parametre sınırı var.
  for (let start = 0; start < rows.length; start += 500) {
    const chunk = rows.slice(start, start + 500);
    const params: unknown[] = [];
    const values = chunk
      .map((row) => {
        const placeholders = all.map((col) => {
          params.push(col === 'user_id' ? userId : row[col]);
          return `$${params.length}`;
        });
        return `(${placeholders.join(', ')})`;
      })
      .join(', ');
    const { rows: result } = await client.query<{ id: string }>(
      `INSERT INTO ${table} (${all.join(', ')}) VALUES ${values}
       ON CONFLICT (id) DO UPDATE SET ${updates}, server_updated_at = now()
       WHERE ${table}.user_id = EXCLUDED.user_id AND ${table}.updated_at < EXCLUDED.updated_at
       RETURNING id`,
      params,
    );
    for (const r of result) accepted.add(r.id);
  }
  return accepted;
}

export async function syncRoutes(app: FastifyInstance, { db }: AppDeps) {
  app.post('/sync/push', { preHandler: app.authenticate, bodyLimit: 10 * 1024 * 1024 }, async (req) => {
    const { changes } = pushSchema.parse(req.body);
    const userId = req.user.sub;

    // Katalogda olmayan bir kitaba bağlı kayıt kabul edilmez (istemci önce kitabı oluşturmalı).
    const bookIds = [...new Set(changes.user_books.map((u) => u.book_id))];
    const known = new Set(
      bookIds.length
        ? (await db.query<{ id: string }>('SELECT id FROM books WHERE id = ANY($1::uuid[])', [bookIds])).rows.map(
            (r) => r.id,
          )
        : [],
    );
    const userBooks = changes.user_books.filter((u) => known.has(u.book_id));

    const accepted = await withTransaction(db, async (client) => {
      const a = await upsert(client, 'locations', userId, ['name', 'parent_id'], changes.locations);
      const b = await upsert(
        client,
        'user_books',
        userId,
        ['book_id', 'status', 'location_id', 'added_via', 'created_at'],
        userBooks,
      );
      const c = await upsert(
        client,
        'loans',
        userId,
        ['user_book_id', 'borrower_name', 'lent_at', 'due_at', 'returned_at'],
        changes.loans,
      );
      return new Set([...a, ...b, ...c]);
    });

    const all = [...changes.locations, ...changes.user_books, ...changes.loans];
    const response: SyncPushResponse = { rejected: all.filter((r) => !accepted.has(r.id)).map((r) => r.id) };
    return response;
  });

  app.get('/sync/pull', { preHandler: app.authenticate }, async (req): Promise<SyncPullResponse> => {
    const { since } = z.object({ since: isoDate.optional() }).parse(req.query);
    const userId = req.user.sub;
    const after = since ?? '1970-01-01T00:00:00Z';

    // Sunucu zamanı biraz geriden verilir: o an süren bir yazma işlemi bir sonraki
    // pull'da kaçmasın. Aynı kaydın iki kez gelmesi istemcide zararsız.
    const { rows: timeRows } = await db.query<{ t: string }>("SELECT clock_timestamp() - interval '30 seconds' AS t");

    const [locations, userBooks, loans] = await Promise.all([
      db.query(
        `SELECT id, name, parent_id, updated_at, deleted_at FROM locations
         WHERE user_id = $1 AND server_updated_at > $2`,
        [userId, after],
      ),
      db.query(
        `SELECT id, book_id, status, location_id, added_via, created_at, updated_at, deleted_at FROM user_books
         WHERE user_id = $1 AND server_updated_at > $2`,
        [userId, after],
      ),
      db.query(
        `SELECT id, user_book_id, borrower_name, lent_at, due_at, returned_at, updated_at, deleted_at FROM loans
         WHERE user_id = $1 AND server_updated_at > $2`,
        [userId, after],
      ),
    ]);
    const books = await getBooks(db, [...new Set(userBooks.rows.map((r) => r.book_id as string))]);

    return {
      changes: { locations: locations.rows, user_books: userBooks.rows, loans: loans.rows },
      books,
      server_time: timeRows[0]!.t,
    };
  });
}
