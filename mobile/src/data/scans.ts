import type { Quota, ScanItem, ScanResponse } from '@kitaplik/shared';
import { desc, eq } from 'drizzle-orm';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { db } from '@/db/client';
import { notifyChange } from '@/db/changes';
import { pendingScans, type PendingScanRow } from '@/db/schema';
import { api, ApiError, fileFormData, isOffline } from '@/lib/api';
import { currentUser } from '@/lib/auth';
import { notifyNow } from '@/lib/notifications';
import { addCatalogBook } from './library';
import { newId, now } from './util';

const MAX_EDGE = 2000;

/** Yükleme öncesi küçültme: uzun kenar ~2000 px, JPEG. Yön bilgisi bu adımda piksellere işlenir. */
export async function preparePhoto(uri: string, width?: number, height?: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width && height && Math.max(width, height) > MAX_EDGE) {
    ctx.resize(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return saved.uri;
}

export async function fetchQuota(): Promise<Quota> {
  return api<Quota>('/scans/quota');
}

export async function uploadShelf(uri: string): Promise<ScanResponse> {
  const form = await fileFormData('photo', uri, 'raf.jpg');
  // Model yanıtı ve eşleştirme birkaç saniyeden uzun sürebilir.
  return api<ScanResponse>('/scans', { method: 'POST', form, timeoutMs: 150_000 });
}

function scansDir(): Directory {
  const dir = new Directory(Paths.document, 'scans');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** İnternet yokken çekilen fotoğrafı kalıcı klasöre alıp kuyruğa koyar. */
export function queueShelfPhoto(uri: string): PendingScanRow {
  const id = newId();
  let stored = uri;
  if (Platform.OS !== 'web') {
    const target = new File(scansDir(), `${id}.jpg`);
    new File(uri).copy(target);
    stored = target.uri;
  }
  const row: PendingScanRow = { id, photoUri: stored, status: 'queued', result: null, error: null, createdAt: now() };
  db.insert(pendingScans).values(row).run();
  notifyChange('pending_scans');
  return row;
}

export function listPendingScans(): PendingScanRow[] {
  return db.select().from(pendingScans).orderBy(desc(pendingScans.createdAt)).all();
}

export function getPendingScan(id: string): PendingScanRow | null {
  return db.select().from(pendingScans).where(eq(pendingScans.id, id)).get() ?? null;
}

export function removePendingScan(id: string) {
  const row = getPendingScan(id);
  if (row && Platform.OS !== 'web') {
    try {
      const file = new File(row.photoUri);
      if (file.exists) file.delete();
    } catch {
      // Dosya zaten yoksa sorun değil.
    }
  }
  db.delete(pendingScans).where(eq(pendingScans.id, id)).run();
  notifyChange('pending_scans');
}

/**
 * Raf fotoğrafını işler ve sonucu onay listesi için kaydeder. Kullanıcı ekranı
 * kapatsa da sürer; `detached()` doğruysa bitince bildirim gönderir.
 * İnternet yoksa fotoğraf kuyruğa alınır ve `queued` döner.
 */
export async function runShelfScan(
  uri: string,
  detached: () => boolean,
): Promise<{ kind: 'done'; pendingId: string; count: number } | { kind: 'queued' }> {
  try {
    const result = await uploadShelf(uri);
    const id = newId();
    db.insert(pendingScans)
      .values({ id, photoUri: uri, status: 'done', result: JSON.stringify(result), error: null, createdAt: now() })
      .run();
    notifyChange('pending_scans');
    if (detached()) {
      await notifyNow(
        'Raf taraması hazır',
        `${result.items.length} kitap bulundu. Onaylamak için dokun.`,
        `/scan/review?pending=${id}`,
      );
    }
    return { kind: 'done', pendingId: id, count: result.items.length };
  } catch (err) {
    if (isOffline(err) || (err instanceof ApiError && err.status >= 500)) {
      queueShelfPhoto(uri);
      return { kind: 'queued' };
    }
    throw err;
  }
}

/** Kuyruktaki raf fotoğraflarını işler; biten her tarama için bildirim gönderir. */
export async function processScanQueue() {
  if (!currentUser()) return;
  const queued = listPendingScans().filter((s) => s.status === 'queued');
  for (const scan of queued) {
    db.update(pendingScans).set({ status: 'processing' }).where(eq(pendingScans.id, scan.id)).run();
    notifyChange('pending_scans');
    try {
      const result = await uploadShelf(scan.photoUri);
      db.update(pendingScans)
        .set({ status: 'done', result: JSON.stringify(result), error: null })
        .where(eq(pendingScans.id, scan.id))
        .run();
      await notifyNow(
        'Raf taraması hazır',
        `${result.items.length} kitap bulundu. Onaylamak için dokun.`,
        `/scan/review?pending=${scan.id}`,
      );
    } catch (err) {
      const offline = isOffline(err);
      const retryable = offline || (err instanceof ApiError && err.status >= 500);
      db.update(pendingScans)
        .set({ status: retryable ? 'queued' : 'failed', error: (err as Error).message })
        .where(eq(pendingScans.id, scan.id))
        .run();
      if (offline) break;
    } finally {
      notifyChange('pending_scans');
    }
  }
}

export interface ShelfSelection {
  item: ScanItem;
  /** Seçilen adayın indeksi; null = atla. */
  candidateIndex: number | null;
}

/** Onay listesindeki seçimleri kütüphaneye ekler; zaten var olanları tekrar eklemez. */
export function addShelfSelections(selections: ShelfSelection[], locationId: string | null) {
  const addedIds: string[] = [];
  let existed = 0;
  for (const { item, candidateIndex } of selections) {
    if (candidateIndex === null) continue;
    const candidate = item.candidates[candidateIndex];
    if (!candidate) continue;
    const res = addCatalogBook(candidate.book, { addedVia: 'shelf', locationId });
    if (res.existed) existed++;
    else addedIds.push(res.userBook.id);
  }
  return { added: addedIds.length, existed, addedIds };
}

/** Kullanıcının son seçimlerini sunucuya bildirir (öğrenme döngüsü). Hata uygulamayı durdurmaz. */
export async function confirmScan(scanId: string, selections: ShelfSelection[]) {
  try {
    await api(`/scans/${scanId}/confirm`, {
      method: 'POST',
      body: {
        items: selections.map((s) => ({
          position: s.item.position,
          book_id: s.candidateIndex === null ? null : (s.item.candidates[s.candidateIndex]?.book.id ?? null),
        })),
      },
    });
  } catch {
    // İstatistik amaçlı; başarısız olursa kullanıcıya yansıtmaya gerek yok.
  }
}
