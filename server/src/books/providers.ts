import { toIsbn13 } from '@kitaplik/shared';

// Dış kitap API'lerinden gelen ham bilgi; kataloğa yazılmadan önceki hali.
export interface ExternalBook {
  isbn13: string | null;
  title: string;
  authors: string[];
  publisher: string | null;
  year: number | null;
  page_count: number | null;
  cover_url: string | null;
  source: 'google_books' | 'open_library';
}

export type Fetch = typeof fetch;

export interface BookProviders {
  byIsbn(isbn13: string): Promise<ExternalBook | null>;
  search(query: { title: string; author?: string | null }, limit?: number): Promise<ExternalBook[]>;
}

function parseYear(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const m = String(value).match(/\d{4}/);
  return m ? Number(m[0]) : null;
}

function httpsUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//, 'https://').replace('&edge=curl', '');
}

interface GoogleVolume {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    pageCount?: number;
    industryIdentifiers?: { type: string; identifier: string }[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
}

function fromGoogle(item: GoogleVolume): ExternalBook | null {
  const v = item.volumeInfo;
  if (!v?.title) return null;
  const ids = v.industryIdentifiers ?? [];
  const isbn =
    ids.find((i) => i.type === 'ISBN_13')?.identifier ?? ids.find((i) => i.type === 'ISBN_10')?.identifier;
  return {
    isbn13: isbn ? toIsbn13(isbn) : null,
    title: v.title,
    authors: v.authors ?? [],
    publisher: v.publisher ?? null,
    year: parseYear(v.publishedDate),
    page_count: v.pageCount ?? null,
    cover_url: httpsUrl(v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail),
    source: 'google_books',
  };
}

export class GoogleBooks {
  constructor(
    private readonly fetchFn: Fetch,
    private readonly apiKey?: string,
  ) {}

  private async query(q: string, limit: number): Promise<ExternalBook[]> {
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.searchParams.set('q', q);
    url.searchParams.set('maxResults', String(limit));
    url.searchParams.set('printType', 'books');
    if (this.apiKey) url.searchParams.set('key', this.apiKey);
    const res = await this.fetchFn(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Google Books ${res.status}`);
    const body = (await res.json()) as { items?: GoogleVolume[] };
    return (body.items ?? []).map(fromGoogle).filter((b): b is ExternalBook => b !== null);
  }

  async byIsbn(isbn13: string): Promise<ExternalBook | null> {
    const [first] = await this.query(`isbn:${isbn13}`, 1);
    return first ? { ...first, isbn13: first.isbn13 ?? isbn13 } : null;
  }

  search(query: { title: string; author?: string | null }, limit = 5): Promise<ExternalBook[]> {
    const parts = [`intitle:${query.title}`];
    if (query.author) parts.push(`inauthor:${query.author}`);
    return this.query(parts.join(' '), limit);
  }
}

interface OpenLibraryData {
  title?: string;
  authors?: { name: string }[];
  publishers?: { name: string }[];
  publish_date?: string;
  number_of_pages?: number;
  cover?: { large?: string; medium?: string };
}

export class OpenLibrary {
  constructor(private readonly fetchFn: Fetch) {}

  async byIsbn(isbn13: string): Promise<ExternalBook | null> {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn13}&format=json&jscmd=data`;
    const res = await this.fetchFn(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Open Library ${res.status}`);
    const body = (await res.json()) as Record<string, OpenLibraryData>;
    const d = body[`ISBN:${isbn13}`];
    if (!d?.title) return null;
    return {
      isbn13,
      title: d.title,
      authors: (d.authors ?? []).map((a) => a.name),
      publisher: d.publishers?.[0]?.name ?? null,
      year: parseYear(d.publish_date),
      page_count: d.number_of_pages ?? null,
      cover_url: d.cover?.large ?? d.cover?.medium ?? null,
      source: 'open_library',
    };
  }
}

/**
 * Sırayla Google Books ve Open Library'ye sorar. Bir kaynağın hatası diğerini
 * engellemez; hepsi başarısızsa null döner.
 */
export function createProviders(fetchFn: Fetch, googleApiKey?: string, log?: (msg: string) => void): BookProviders {
  const google = new GoogleBooks(fetchFn, googleApiKey);
  const openLibrary = new OpenLibrary(fetchFn);
  return {
    async byIsbn(isbn13) {
      for (const provider of [google, openLibrary]) {
        try {
          const found = await provider.byIsbn(isbn13);
          if (found) return found;
        } catch (err) {
          log?.(`ISBN araması başarısız (${provider.constructor.name}): ${(err as Error).message}`);
        }
      }
      return null;
    },
    async search(query, limit) {
      try {
        return await google.search(query, limit);
      } catch (err) {
        log?.(`Başlık araması başarısız: ${(err as Error).message}`);
        return [];
      }
    },
  };
}
