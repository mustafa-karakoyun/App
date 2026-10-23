import {
  matchScore,
  normalizeAuthor,
  normalizeText,
  normalizeTitle,
  toIsbn13,
  type Book,
  type ManualBookInput,
  type MatchQuery,
  type ScanCandidate,
} from '@kitaplik/shared';
import type pg from 'pg';
import type { BookProviders, ExternalBook } from './providers';

type Queryable = Pick<pg.Pool, 'query'>;

interface BookRow {
  id: string;
  isbn13: string | null;
  title: string;
  authors: string[];
  publisher: string | null;
  year: number | null;
  page_count: number | null;
  cover_url: string | null;
  source: Book['source'];
  verified: boolean;
}

const BOOK_COLUMNS = 'id, isbn13, title, authors, publisher, year, page_count, cover_url, source, verified';

/** Elle eklenen bir kitabın doğrulanmış sayılması için gereken farklı kullanıcı sayısı. */
export const VERIFY_SUBMISSIONS = 3;

function toBook(row: BookRow): Book {
  return { ...row };
}

export async function getBook(db: Queryable, id: string): Promise<Book | null> {
  const { rows } = await db.query<BookRow>(`SELECT ${BOOK_COLUMNS} FROM books WHERE id = $1`, [id]);
  return rows[0] ? toBook(rows[0]) : null;
}

export async function getBooks(db: Queryable, ids: string[]): Promise<Book[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<BookRow>(`SELECT ${BOOK_COLUMNS} FROM books WHERE id = ANY($1::uuid[])`, [ids]);
  return rows.map(toBook);
}

async function findByIsbn(db: Queryable, isbn13: string): Promise<Book | null> {
  const { rows } = await db.query<BookRow>(`SELECT ${BOOK_COLUMNS} FROM books WHERE isbn13 = $1`, [isbn13]);
  return rows[0] ? toBook(rows[0]) : null;
}

/** Dış API yanıtını kataloğa yazar; aynı ISBN varsa eksik alanları doldurur. */
export async function upsertExternal(db: Queryable, ext: ExternalBook): Promise<Book> {
  const params = [
    ext.isbn13,
    ext.title,
    ext.authors,
    ext.publisher,
    ext.year,
    ext.page_count,
    ext.cover_url,
    ext.source,
    normalizeTitle(ext.title),
    normalizeAuthor(ext.authors.join(' ')),
  ];
  if (ext.isbn13) {
    const { rows } = await db.query<BookRow>(
      `INSERT INTO books (isbn13, title, authors, publisher, year, page_count, cover_url, source, verified, normalized_title, normalized_authors)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10)
       ON CONFLICT (isbn13) DO UPDATE SET
         cover_url = COALESCE(books.cover_url, EXCLUDED.cover_url),
         page_count = COALESCE(books.page_count, EXCLUDED.page_count),
         year = COALESCE(books.year, EXCLUDED.year),
         publisher = COALESCE(books.publisher, EXCLUDED.publisher),
         updated_at = now()
       RETURNING ${BOOK_COLUMNS}`,
      params,
    );
    return toBook(rows[0]!);
  }
  // ISBN'siz sonuçlar (eski baskılar) başlık+yazar ile tekilleştirilir.
  const existing = await db.query<BookRow>(
    `SELECT ${BOOK_COLUMNS} FROM books WHERE isbn13 IS NULL AND normalized_title = $1 AND normalized_authors = $2 LIMIT 1`,
    [params[8], params[9]],
  );
  if (existing.rows[0]) return toBook(existing.rows[0]);
  const { rows } = await db.query<BookRow>(
    `INSERT INTO books (isbn13, title, authors, publisher, year, page_count, cover_url, source, verified, normalized_title, normalized_authors)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10)
     RETURNING ${BOOK_COLUMNS}`,
    params,
  );
  return toBook(rows[0]!);
}

/**
 * ISBN ile kitap bulur: önce kendi katalog, sonra dış API'ler. Bulunan her sonuç
 * kataloğa yazılır, böylece aynı ISBN ikinci kez dışarı sorulmaz.
 */
export async function lookupIsbn(db: Queryable, providers: BookProviders, isbn: string): Promise<Book | null> {
  const isbn13 = toIsbn13(isbn);
  if (!isbn13) return null;
  const cached = await findByIsbn(db, isbn13);
  if (cached) return cached;
  const ext = await providers.byIsbn(isbn13);
  return ext ? upsertExternal(db, ext) : null;
}

/** Arama kutusu için: başlık ya da yazarda bulanık arama. */
export async function searchCatalog(db: Queryable, q: string, limit = 20): Promise<Book[]> {
  const isbn13 = toIsbn13(q);
  if (isbn13) {
    const book = await findByIsbn(db, isbn13);
    return book ? [book] : [];
  }
  const norm = normalizeText(q);
  if (!norm) return [];
  const { rows } = await db.query<BookRow>(
    `SELECT ${BOOK_COLUMNS} FROM books
     WHERE normalized_title % $1 OR normalized_authors % $1 OR normalized_title LIKE '%' || $1 || '%'
     ORDER BY GREATEST(similarity(normalized_title, $1), word_similarity($1, normalized_title), similarity(normalized_authors, $1)) DESC,
              verified DESC
     LIMIT $2`,
    [norm, limit],
  );
  return rows.map(toBook);
}

export function aliasKey(title: string | null, author: string | null): string {
  return `${normalizeTitle(title)}|${normalizeAuthor(author)}`;
}

/**
 * Raf taramasındaki bir kitap için puanlı adaylar. Kaynak sırası: kullanıcıların
 * daha önce onayladığı eşleşmeler, katalog, en son dış API.
 */
export async function findCandidates(
  db: Queryable,
  providers: BookProviders,
  query: MatchQuery,
  opts: { limit?: number; external?: boolean } = {},
): Promise<ScanCandidate[]> {
  const limit = opts.limit ?? 5;
  const byId = new Map<string, ScanCandidate>();
  const add = (book: Book, score: number) => {
    const prev = byId.get(book.id);
    if (!prev || prev.score < score) byId.set(book.id, { book, score });
  };

  const aliases = await db.query<BookRow & { confirmations: number }>(
    `SELECT b.id, b.isbn13, b.title, b.authors, b.publisher, b.year, b.page_count, b.cover_url, b.source, b.verified, a.confirmations
     FROM scan_aliases a JOIN books b ON b.id = a.book_id
     WHERE a.alias_key = $1 ORDER BY a.confirmations DESC LIMIT 3`,
    [aliasKey(query.title, query.author ?? null)],
  );
  for (const row of aliases.rows) {
    const { confirmations, ...book } = row;
    // Onaylanmış eşleşme, metin benzerliğinden bağımsız olarak güçlü sinyal.
    add(toBook(book), Math.min(0.99, 0.9 + confirmations * 0.03));
  }

  const normTitle = normalizeTitle(query.title);
  if (normTitle) {
    const { rows } = await db.query<BookRow>(
      `SELECT ${BOOK_COLUMNS} FROM books
       WHERE normalized_title % $1 OR word_similarity($1, normalized_title) > 0.5
       ORDER BY similarity(normalized_title, $1) DESC LIMIT 10`,
      [normTitle],
    );
    for (const row of rows) add(toBook(row), matchScore(query, row));
  }

  const best = Math.max(0, ...[...byId.values()].map((c) => c.score));
  if (opts.external !== false && best < 0.8 && normTitle) {
    const external = await providers.search({ title: query.title, author: query.author }, 5);
    for (const ext of external) {
      const score = matchScore(query, ext);
      // Düşük puanlı dış sonuçlar kataloğu kirletmesin.
      if (score < 0.4) continue;
      add(await upsertExternal(db, ext), score);
    }
  }

  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function recordAlias(db: Queryable, title: string | null, author: string | null, bookId: string) {
  const key = aliasKey(title, author);
  if (key === '|') return;
  await db.query(
    `INSERT INTO scan_aliases (alias_key, book_id) VALUES ($1, $2)
     ON CONFLICT (alias_key, book_id) DO UPDATE SET confirmations = scan_aliases.confirmations + 1, updated_at = now()`,
    [key, bookId],
  );
}

/**
 * Elle eklenen kitap ortak kataloğa doğrulanmamış girer. Aynı bilgiyle
 * {@link VERIFY_SUBMISSIONS} farklı kullanıcı eklerse doğrulanır.
 */
export async function addManualBook(
  db: Queryable,
  userId: string,
  input: ManualBookInput & { id?: string },
): Promise<Book> {
  const isbn13 = input.isbn13 ? toIsbn13(input.isbn13) : null;
  const normTitle = normalizeTitle(input.title);
  const normAuthors = normalizeAuthor(input.authors.join(' '));

  let existing: Book | null = null;
  if (input.id) existing = await getBook(db, input.id);
  if (!existing && isbn13) existing = await findByIsbn(db, isbn13);
  if (!existing) {
    const { rows } = await db.query<BookRow>(
      `SELECT ${BOOK_COLUMNS} FROM books WHERE normalized_title = $1 AND normalized_authors = $2
       AND ($3::text IS NULL OR isbn13 IS NULL OR isbn13 = $3) LIMIT 1`,
      [normTitle, normAuthors, isbn13],
    );
    existing = rows[0] ? toBook(rows[0]) : null;
  }

  let book: Book;
  if (existing) {
    book = existing;
  } else {
    const { rows } = await db.query<BookRow>(
      `INSERT INTO books (id, isbn13, title, authors, publisher, year, page_count, source, verified, normalized_title, normalized_authors, created_by)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, 'manual', false, $8, $9, $10)
       RETURNING ${BOOK_COLUMNS}`,
      [
        input.id ?? null,
        isbn13,
        input.title.trim(),
        input.authors.map((a) => a.trim()).filter(Boolean),
        input.publisher?.trim() || null,
        input.year ?? null,
        input.page_count ?? null,
        normTitle,
        normAuthors,
        userId,
      ],
    );
    book = toBook(rows[0]!);
  }

  if (book.source === 'manual' && !book.verified) {
    const sameInfo =
      normalizeTitle(book.title) === normTitle && normalizeAuthor(book.authors.join(' ')) === normAuthors;
    if (sameInfo) {
      await db.query('INSERT INTO book_submissions (book_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
        book.id,
        userId,
      ]);
      const { rows } = await db.query<{ n: string }>('SELECT count(*) AS n FROM book_submissions WHERE book_id = $1', [
        book.id,
      ]);
      if (Number(rows[0]!.n) >= VERIFY_SUBMISSIONS) {
        await db.query('UPDATE books SET verified = true, updated_at = now() WHERE id = $1', [book.id]);
        book = { ...book, verified: true };
      }
    }
  }
  return book;
}

export async function setCover(db: Queryable, bookId: string, coverUrl: string): Promise<Book | null> {
  const { rows } = await db.query<BookRow>(
    `UPDATE books SET cover_url = $2, updated_at = now() WHERE id = $1 RETURNING ${BOOK_COLUMNS}`,
    [bookId, coverUrl],
  );
  return rows[0] ? toBook(rows[0]) : null;
}
