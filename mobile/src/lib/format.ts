import type { ReadingStatus } from '@kitaplik/shared';

export const STATUS_LABELS: Record<ReadingStatus, string> = {
  to_read: 'Okunacak',
  reading: 'Okunuyor',
  read: 'Okundu',
  abandoned: 'Yarıda bırakıldı',
};

export const STATUS_ORDER: ReadingStatus[] = ['reading', 'to_read', 'read', 'abandoned'];

const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

export function formatDate(iso: string | null | undefined, withYear = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withYear || d.getFullYear() !== new Date().getFullYear() ? `${base} ${d.getFullYear()}` : base;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "3 gün geçti", "yarın", "12 gün kaldı" */
export function dueText(dueIso: string): { text: string; overdue: boolean } {
  const days = Math.round((startOfDay(new Date(dueIso)) - startOfDay(new Date())) / 86_400_000);
  if (days < 0) return { text: `${-days} gün gecikti`, overdue: true };
  if (days === 0) return { text: 'Bugün iade', overdue: false };
  if (days === 1) return { text: 'Yarın iade', overdue: false };
  return { text: `${days} gün kaldı`, overdue: false };
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'hiç';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'az önce';
  if (min < 60) return `${min} dk önce`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} saat önce`;
  return formatDate(iso);
}

export function authorsText(authorsJson: string | string[]): string {
  const list = Array.isArray(authorsJson) ? authorsJson : safeParse(authorsJson);
  return list.join(', ');
}

function safeParse(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function plural(n: number, word: string) {
  return `${n} ${word}`;
}
