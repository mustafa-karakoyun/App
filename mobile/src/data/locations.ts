import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { notifyChange } from '@/db/changes';
import { locations, userBooks, type LocationRow } from '@/db/schema';
import { enqueue, newId, now } from './util';

export function listLocations(): LocationRow[] {
  return db.select().from(locations).where(isNull(locations.deletedAt)).all();
}

export interface LocationNode extends LocationRow {
  depth: number;
  path: string;
}

/** Oda > raf > kutu ağacını derinlik sırasıyla düz listeye çevirir (seçici ve yönetim ekranı için). */
export function locationTree(rows: LocationRow[] = listLocations()): LocationNode[] {
  const children = new Map<string | null, LocationRow[]>();
  const ids = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    // Ebeveyni silinmiş (ya da hiç gelmemiş) konum kökte görünsün.
    const parent = r.parentId && ids.has(r.parentId) ? r.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(r);
    children.set(parent, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  const out: LocationNode[] = [];
  const walk = (parent: string | null, depth: number, prefix: string) => {
    for (const r of children.get(parent) ?? []) {
      const path = prefix ? `${prefix} / ${r.name}` : r.name;
      out.push({ ...r, depth, path });
      if (depth < 8) walk(r.id, depth + 1, path);
    }
  };
  walk(null, 0, '');
  return out;
}

export function locationPaths(): Map<string, string> {
  return new Map(locationTree().map((n) => [n.id, n.path]));
}

/** Bir konum ve altındaki tüm konumların id'leri (filtrede "Salon" seçilince raflar da gelsin). */
export function descendantIds(id: string, rows: LocationRow[] = listLocations()): Set<string> {
  const result = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) {
      if (r.parentId && result.has(r.parentId) && !result.has(r.id)) {
        result.add(r.id);
        grew = true;
      }
    }
  }
  return result;
}

export function createLocation(name: string, parentId: string | null): LocationRow {
  const row: LocationRow = { id: newId(), name: name.trim(), parentId, updatedAt: now(), deletedAt: null };
  db.insert(locations).values(row).run();
  enqueue('locations', row.id);
  notifyChange('locations');
  return row;
}

export function renameLocation(id: string, name: string) {
  db.update(locations).set({ name: name.trim(), updatedAt: now() }).where(eq(locations.id, id)).run();
  enqueue('locations', id);
  notifyChange('locations');
}

/** Konumu ve alt konumlarını siler; içindeki kitaplar konumsuz kalır (kitaplar silinmez). */
export function deleteLocation(id: string) {
  const ids = [...descendantIds(id)];
  const t = now();
  db.update(locations).set({ deletedAt: t, updatedAt: t }).where(inArray(locations.id, ids)).run();
  for (const lid of ids) enqueue('locations', lid);

  const affected = db
    .select({ id: userBooks.id })
    .from(userBooks)
    .where(and(inArray(userBooks.locationId, ids), isNull(userBooks.deletedAt)))
    .all();
  if (affected.length) {
    db.update(userBooks)
      .set({ locationId: null, updatedAt: t })
      .where(inArray(userBooks.id, affected.map((a) => a.id)))
      .run();
    for (const a of affected) enqueue('user_books', a.id);
  }
  notifyChange('locations', 'user_books');
}

export function countBooksByLocation(): Map<string, number> {
  const rows = db
    .select({ locationId: userBooks.locationId })
    .from(userBooks)
    .where(isNull(userBooks.deletedAt))
    .all();
  const counts = new Map<string, number>();
  for (const r of rows) if (r.locationId) counts.set(r.locationId, (counts.get(r.locationId) ?? 0) + 1);
  return counts;
}
