/**
 * Faz 0 ölçümü: Türkçe kitapların ISBN'leri dış kaynaklarda bulunuyor mu?
 *
 *   npm run faz0:isbn -- isbnler.txt
 *
 * Dosyada satır başına bir ISBN (10 ya da 13 hane, tire olabilir). Katalog önbelleği
 * kullanılmaz; her kaynak doğrudan sorulur. Sonuç: kaynak başına ve birleşik bulunma oranı.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { toIsbn13 } from '@kitaplik/shared';
import 'dotenv/config';
import { GoogleBooks, OpenLibrary } from '../src/books/providers';

const file = process.argv[2];
if (!file) {
  console.error('Kullanım: npm run faz0:isbn -- isbnler.txt');
  process.exit(1);
}

const lines = (await readFile(file, 'utf8'))
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));
const google = new GoogleBooks(fetch, process.env.GOOGLE_BOOKS_API_KEY || undefined);
const openLibrary = new OpenLibrary(fetch);

type Row = { isbn: string; google: string; openLibrary: string; cover: boolean };
const rows: Row[] = [];
let invalid = 0;

for (const line of lines) {
  const isbn = toIsbn13(line);
  if (!isbn) {
    invalid++;
    console.warn(`Geçersiz ISBN atlandı: ${line}`);
    continue;
  }
  const ask = async (p: GoogleBooks | OpenLibrary) => {
    try {
      return await p.byIsbn(isbn);
    } catch (err) {
      return { error: (err as Error).message };
    }
  };
  const [g, o] = await Promise.all([ask(google), ask(openLibrary)]);
  const label = (r: Awaited<ReturnType<typeof ask>>) => (r && 'error' in r ? `HATA ${r.error}` : r ? r.title : '-');
  const cover = !!((g && !('error' in g) && g.cover_url) || (o && !('error' in o) && o.cover_url));
  rows.push({ isbn, google: label(g), openLibrary: label(o), cover });
  console.log(`${isbn}  Google: ${label(g)}  |  Open Library: ${label(o)}`);
  // Anahtarsız Google Books kotası düşük; istekleri yay.
  await new Promise((r) => setTimeout(r, 400));
}

const found = (v: string) => v !== '-' && !v.startsWith('HATA');
const n = rows.length;
const pct = (k: number) => (n ? `${((k / n) * 100).toFixed(1)}%` : '-');
const g = rows.filter((r) => found(r.google)).length;
const o = rows.filter((r) => found(r.openLibrary)).length;
const any = rows.filter((r) => found(r.google) || found(r.openLibrary)).length;
const covers = rows.filter((r) => r.cover).length;
const errors = rows.filter((r) => r.google.startsWith('HATA') || r.openLibrary.startsWith('HATA')).length;

console.log('\n--- Sonuç ---');
console.log(`Geçerli ISBN: ${n}${invalid ? ` (${invalid} geçersiz atlandı)` : ''}`);
console.log(`Google Books:  ${g}/${n}  ${pct(g)}`);
console.log(`Open Library:  ${o}/${n}  ${pct(o)}`);
console.log(`En az biri:    ${any}/${n}  ${pct(any)}`);
console.log(`Kapak bulunan: ${covers}/${n}  ${pct(covers)}`);
if (errors) console.log(`Uyarı: ${errors} istekte hata oldu (kota ya da ağ); sonuçlar eksik olabilir.`);

const csv = [
  'isbn,google_books,open_library,kapak',
  ...rows.map((r) =>
    [r.isbn, r.google, r.openLibrary, r.cover ? 'evet' : 'hayir'].map((v) => `"${v.replace(/"/g, '""')}"`).join(','),
  ),
].join('\n');
await writeFile('isbn-coverage.csv', csv + '\n');
console.log('Ayrıntılar: isbn-coverage.csv');
