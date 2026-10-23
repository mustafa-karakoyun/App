import sharp from 'sharp';
import { buildApp } from '../src/app';
import type { BookProviders, ExternalBook } from '../src/books/providers';
import { loadConfig } from '../src/config';
import { createDb, type Db } from '../src/db';
import { migrate } from '../src/migrate';
import { MockVisionProvider, type VisionProvider } from '../src/scan/vision';

export const SAMPLE_BOOKS: ExternalBook[] = [
  {
    isbn13: '9789750719387',
    title: 'Suç ve Ceza',
    authors: ['Fyodor Mihayloviç Dostoyevski'],
    publisher: 'İletişim Yayınları',
    year: 2015,
    page_count: 687,
    cover_url: 'https://example.com/suc.jpg',
    source: 'google_books',
  },
  {
    isbn13: '9789753638029',
    title: 'Kürk Mantolu Madonna',
    authors: ['Sabahattin Ali'],
    publisher: 'Yapı Kredi Yayınları',
    year: 2019,
    page_count: 160,
    cover_url: null,
    source: 'google_books',
  },
  {
    isbn13: '9789754700114',
    title: 'Tutunamayanlar',
    authors: ['Oğuz Atay'],
    publisher: 'İletişim Yayınları',
    year: 2000,
    page_count: 724,
    cover_url: null,
    source: 'google_books',
  },
  {
    isbn13: '9789750507038',
    title: 'Masumiyet Müzesi',
    authors: ['Orhan Pamuk'],
    publisher: 'İletişim Yayınları',
    year: 2008,
    page_count: 592,
    cover_url: null,
    source: 'google_books',
  },
  {
    isbn13: '9789750508257',
    title: 'Masumiyet',
    authors: ['Ayşe Kulin'],
    publisher: 'Everest',
    year: 2010,
    page_count: 300,
    cover_url: null,
    source: 'google_books',
  },
];

/** Dış API yerine geçen sahte sağlayıcı; kaç kez çağrıldığını sayar. */
export class FakeProviders implements BookProviders {
  isbnCalls = 0;
  searchCalls = 0;
  constructor(private readonly books: ExternalBook[] = SAMPLE_BOOKS) {}

  async byIsbn(isbn13: string) {
    this.isbnCalls++;
    return this.books.find((b) => b.isbn13 === isbn13) ?? null;
  }

  async search(query: { title: string }) {
    this.searchCalls++;
    const q = query.title.toLocaleLowerCase('tr').split(' ')[0]!;
    return this.books.filter((b) => b.title.toLocaleLowerCase('tr').includes(q));
  }
}

export async function resetDb(db: Db) {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
}

export async function createTestApp(opts: { vision?: VisionProvider; providers?: FakeProviders } = {}) {
  const config = loadConfig({ ...process.env, SCAN_MONTHLY_LIMIT: '3', UPLOAD_DIR: '/tmp/kitaplik-test-uploads' });
  const db = createDb(config.DATABASE_URL);
  await resetDb(db);
  const providers = opts.providers ?? new FakeProviders();
  const app = await buildApp({ config, db, providers, vision: opts.vision ?? new MockVisionProvider() });
  return {
    app,
    db,
    providers,
    async close() {
      await app.close();
      await db.end();
    },
  };
}

export async function registerUser(app: Awaited<ReturnType<typeof createTestApp>>['app'], email = 'okur@example.com') {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'gizli-sifre', name: 'Okur' },
  });
  const body = res.json() as { token: string; user: { id: string } };
  return { token: body.token, userId: body.user.id, headers: { authorization: `Bearer ${body.token}` } };
}

export async function jpeg(width = 1200, height = 800): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#c8b89a' } })
    .jpeg()
    .toBuffer();
}

/** Tek dosyalı multipart gövdesi üretir. */
export function multipart(field: string, file: Buffer, filename = 'raf.jpg') {
  const boundary = '----kitaplik' + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, file, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
