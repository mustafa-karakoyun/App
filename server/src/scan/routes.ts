import type { Quota, ScanResponse } from '@kitaplik/shared';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { recordAlias } from '../books/catalog';
import { httpError } from '../errors';
import { matchShelf, readShelf } from './pipeline';
import type { ShelfOutput } from './vision';

function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function nextMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export async function getQuota(db: Pick<pg.Pool, 'query'>, userId: string, freeLimit: number): Promise<Quota> {
  const { rows } = await db.query<{ plan: string; used: string }>(
    `SELECT u.plan,
       (SELECT count(*) FROM scans s WHERE s.user_id = u.id AND s.status <> 'failed' AND s.created_at >= $2) AS used
     FROM users u WHERE u.id = $1`,
    [userId, monthStart().toISOString()],
  );
  const row = rows[0];
  if (!row) throw httpError(401, 'unauthorized', 'Oturum geçersiz');
  // Premium için pratikte sınırsız; kötüye kullanıma karşı yine de bir tavan var.
  const limit = row.plan === 'premium' ? 1000 : freeLimit;
  return { used: Number(row.used), limit, resets_at: nextMonthStart().toISOString() };
}

const confirmSchema = z.object({
  items: z.array(z.object({ position: z.number().int(), book_id: z.uuid().nullable() })).max(200),
});

export async function scanRoutes(app: FastifyInstance, { db, providers, vision, config }: AppDeps) {
  app.get('/scans/quota', { preHandler: app.authenticate }, async (req) => {
    return getQuota(db, req.user.sub, config.SCAN_MONTHLY_LIMIT);
  });

  app.post('/scans', { preHandler: app.authenticate }, async (req): Promise<ScanResponse> => {
    const userId = req.user.sub;
    const quota = await getQuota(db, userId, config.SCAN_MONTHLY_LIMIT);
    if (quota.used >= quota.limit) {
      throw httpError(429, 'quota_exceeded', 'Bu ayki raf tarama hakkın doldu. Barkod ve elle ekleme sınırsız.', {
        quota,
      });
    }
    const file = await req.file();
    if (!file) throw httpError(400, 'no_file', 'Raf fotoğrafı gönderilmedi');
    // Fotoğraf yalnızca bellekte işlenir, diske ya da veri tabanına yazılmaz.
    const photo = await file.toBuffer();

    const started = Date.now();
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO scans (user_id, status) VALUES ($1, 'processing') RETURNING id`,
      [userId],
    );
    const scanId = rows[0]!.id;

    let output: ShelfOutput;
    try {
      output = await readShelf(vision, photo);
    } catch (err) {
      req.log.error({ err, scanId }, 'raf okuma başarısız');
      await db.query(`UPDATE scans SET status = 'failed', duration_ms = $2 WHERE id = $1`, [
        scanId,
        Date.now() - started,
      ]);
      const isImageError = /Input buffer|unsupported image/i.test((err as Error).message);
      throw isImageError
        ? httpError(400, 'invalid_image', 'Fotoğraf okunamadı, tekrar çekmeyi dene')
        : httpError(502, 'vision_failed', 'Raf şu an okunamadı. Fotoğraf kuyrukta kalacak, birazdan tekrar denenecek.');
    }

    const items = await matchShelf(db, providers, output);
    const stats = {
      matched: items.filter((i) => i.group === 'matched').length,
      verify: items.filter((i) => i.group === 'verify').length,
      not_found: items.filter((i) => i.group === 'not_found').length,
    };
    await db.query(
      `UPDATE scans SET status = 'done', model_output = $2, match_stats = $3, duration_ms = $4 WHERE id = $1`,
      [scanId, JSON.stringify({ provider: vision.name, ...output }), JSON.stringify(stats), Date.now() - started],
    );
    return {
      scan_id: scanId,
      items,
      unreadable_count: output.unreadable_count,
      stats,
      quota: { ...quota, used: quota.used + 1 },
    };
  });

  // Kullanıcının onay listesindeki son seçimleri: öğrenme döngüsü ve doğruluk ölçümü için.
  app.post('/scans/:id/confirm', { preHandler: app.authenticate }, async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const body = confirmSchema.parse(req.body);
    const { rows } = await db.query<{ model_output: ShelfOutput | null; match_stats: Record<string, number> | null }>(
      'SELECT model_output, match_stats FROM scans WHERE id = $1 AND user_id = $2',
      [id, req.user.sub],
    );
    const scan = rows[0];
    if (!scan?.model_output) throw httpError(404, 'not_found', 'Tarama bulunamadı');

    const byPosition = new Map(scan.model_output.books.map((b) => [b.position, b]));
    const existingBooks = await db.query<{ id: string }>('SELECT id FROM books WHERE id = ANY($1::uuid[])', [
      body.items.map((i) => i.book_id).filter((v): v is string => !!v),
    ]);
    const validIds = new Set(existingBooks.rows.map((r) => r.id));

    let accepted = 0;
    for (const item of body.items) {
      const read = byPosition.get(item.position);
      if (!read || !item.book_id || !validIds.has(item.book_id)) continue;
      accepted++;
      await recordAlias(db, read.title, read.author, item.book_id);
    }
    await db.query('UPDATE scans SET match_stats = $2 WHERE id = $1', [
      id,
      JSON.stringify({ ...scan.match_stats, accepted, skipped: body.items.length - accepted }),
    ]);
    return { accepted };
  });
}
