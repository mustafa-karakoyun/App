import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { httpError } from '../errors';
import { addManualBook, getBook, lookupIsbn, searchCatalog, setCover, upsertExternal } from './catalog';

const manualSchema = z.object({
  id: z.uuid().optional(),
  isbn13: z.string().max(20).nullish(),
  title: z.string().trim().min(1).max(300),
  authors: z.array(z.string().trim().max(200)).max(10).default([]),
  publisher: z.string().trim().max(200).nullish(),
  year: z.number().int().min(1400).max(2100).nullish(),
  page_count: z.number().int().min(1).max(20000).nullish(),
});

export async function bookRoutes(app: FastifyInstance, { db, providers, config }: AppDeps) {
  // ISBN araması ve arama hesapsız da kullanılabilir: uygulama hesap açmadan çalışıyor.
  app.get('/books/isbn/:isbn', async (req) => {
    const { isbn } = z.object({ isbn: z.string().max(20) }).parse(req.params);
    const book = await lookupIsbn(db, providers, isbn);
    if (!book) throw httpError(404, 'not_found', 'Bu ISBN ile kitap bulunamadı');
    return book;
  });

  app.get('/books/search', async (req) => {
    const { q, external } = z
      .object({
        q: z.string().trim().min(2).max(200),
        external: z
          .string()
          .optional()
          .transform((v) => v === '1' || v === 'true'),
      })
      .parse(req.query);
    const local = await searchCatalog(db, q, 20);
    if (!external || local.length >= 5) return { books: local };
    const found = await providers.search({ title: q }, 10);
    const ids = new Set(local.map((b) => b.id));
    const merged = [...local];
    for (const ext of found) {
      const book = await upsertExternal(db, ext);
      if (!ids.has(book.id)) {
        ids.add(book.id);
        merged.push(book);
      }
    }
    return { books: merged };
  });

  app.get('/books/:id', async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const book = await getBook(db, id);
    if (!book) throw httpError(404, 'not_found', 'Kitap bulunamadı');
    return book;
  });

  app.post('/books', { preHandler: app.authenticate }, async (req, reply) => {
    const body = manualSchema.parse(req.body);
    const book = await addManualBook(db, req.user.sub, body);
    reply.code(201);
    return book;
  });

  app.post('/books/:id/cover', { preHandler: app.authenticate }, async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const { rows } = await db.query<{ cover_url: string | null; created_by: string | null }>(
      'SELECT cover_url, created_by FROM books WHERE id = $1',
      [id],
    );
    const row = rows[0];
    if (!row) throw httpError(404, 'not_found', 'Kitap bulunamadı');
    // Ortak katalogdaki mevcut bir kapağı yalnızca kitabı ekleyen değiştirebilir.
    if (row.cover_url && row.created_by !== req.user.sub) {
      throw httpError(403, 'forbidden', 'Bu kitabın kapağı zaten var');
    }
    const file = await req.file();
    if (!file) throw httpError(400, 'no_file', 'Kapak fotoğrafı gönderilmedi');
    const input = await file.toBuffer();
    const image = await sharp(input)
      .rotate()
      .resize({ width: 800, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer()
      .catch(() => {
        throw httpError(400, 'invalid_image', 'Görsel okunamadı');
      });
    const dir = path.resolve(config.UPLOAD_DIR, 'covers');
    await mkdir(dir, { recursive: true });
    const name = `${id}-${randomUUID().slice(0, 8)}.jpg`;
    await writeFile(path.join(dir, name), image);
    return setCover(db, id, `${config.PUBLIC_URL.replace(/\/$/, '')}/uploads/covers/${name}`);
  });
}
