import { classifyMatch, normalizeTitle, type ScanItem } from '@kitaplik/shared';
import sharp from 'sharp';
import type pg from 'pg';
import type { BookProviders } from '../books/providers';
import { findCandidates } from '../books/catalog';
import type { ShelfOutput, VisionProvider } from './vision';

const MAX_EDGE = 2000;

/** Yönü EXIF'e göre düzeltir, uzun kenarı 2000 piksele indirir, JPEG'e sıkıştırır. */
export async function prepareImage(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Okunamayan sırt sayısı bu eşiği geçerse fotoğraf parçalanıp yeniden sorulur. */
export function shouldSplit(output: ShelfOutput): boolean {
  return output.unreadable_count >= Math.max(3, Math.ceil(output.books.length * 0.3));
}

/** Görseli yatayda üç parçaya böler; sınırdaki kitap kaybolmasın diye parçalar biraz örtüşür. */
async function splitIntoThree(image: Buffer, width: number, height: number): Promise<Buffer[]> {
  const third = Math.floor(width / 3);
  const overlap = Math.floor(width * 0.04);
  const parts: Buffer[] = [];
  for (let i = 0; i < 3; i++) {
    const left = Math.max(0, i * third - overlap);
    const right = i === 2 ? width : Math.min(width, (i + 1) * third + overlap);
    parts.push(
      await sharp(image)
        .extract({ left, top: 0, width: right - left, height })
        .jpeg({ quality: 85 })
        .toBuffer(),
    );
  }
  return parts;
}

/** Parça sonuçlarını soldan sağa birleştirir; örtüşmede iki kez okunan kitabı atar. */
export function mergeParts(parts: ShelfOutput[]): ShelfOutput {
  const books: ShelfOutput['books'] = [];
  let unreadable = 0;
  for (const part of parts) {
    unreadable += part.unreadable_count;
    const sorted = [...part.books].sort((a, b) => a.position - b.position);
    for (const book of sorted) {
      const key = normalizeTitle(book.title ?? book.raw_text);
      // Örtüşme yalnızca komşu parçanın kenarında olur: son birkaç kitaba bakmak yeterli.
      const dup = books.slice(-3).find((b) => normalizeTitle(b.title ?? b.raw_text) === key);
      if (dup) {
        dup.confidence = Math.max(dup.confidence, book.confidence);
        continue;
      }
      books.push({ ...book, position: books.length + 1 });
    }
  }
  return { books, unreadable_count: unreadable };
}

export async function readShelf(vision: VisionProvider, photo: Buffer): Promise<ShelfOutput> {
  const { data, width, height } = await prepareImage(photo);
  const first = await vision.readShelf(data, 'image/jpeg');
  if (!shouldSplit(first) || width < 600) return first;

  const parts = await splitIntoThree(data, width, height);
  const results = await Promise.all(parts.map((p) => vision.readShelf(p, 'image/jpeg')));
  const merged = mergeParts(results);
  // Parçalama daha kötü sonuç verdiyse ilk okumayı koru.
  return merged.books.length > first.books.length ? merged : first;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Model çıktısındaki her kitap için aday bulur ve eşleşti/doğrula/bulunamadı diye gruplar. */
export async function matchShelf(
  db: Pick<pg.Pool, 'query'>,
  providers: BookProviders,
  output: ShelfOutput,
): Promise<ScanItem[]> {
  const sorted = [...output.books].sort((a, b) => a.position - b.position);
  return mapLimit(sorted, 4, async (book): Promise<ScanItem> => {
    const base = {
      position: book.position,
      raw_text: book.raw_text,
      title: book.title,
      author: book.author,
      publisher: book.publisher,
      confidence: book.confidence,
    };
    if (!book.title) return { ...base, group: 'not_found', candidates: [] };
    const candidates = await findCandidates(db, providers, {
      title: book.title,
      author: book.author,
      publisher: book.publisher,
    });
    let group = classifyMatch(candidates.map((c) => c.score));
    // Model kendi okumasına güvenmiyorsa kullanıcı baksın; daha önce onaylanmış
    // (çok yüksek puanlı) eşleşmeler hariç.
    const best = candidates[0]?.score ?? 0;
    if (group === 'matched' && book.confidence < 0.6 && best < 0.9) group = 'verify';
    return { ...base, group, candidates };
  });
}
