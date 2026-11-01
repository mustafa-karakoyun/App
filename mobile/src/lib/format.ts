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

// Türkçe ek uyumu: "Ayşe'de / Mert'te", "Ayşe'ye / Mert'e", "6 Kasım'a / 3 Eylül'e".
const BACK_VOWELS = 'aıou';
const VOWELS = 'aeıioöuü';
const HARD = 'fstkçşhp';

function lastVowel(word: string): string {
  const w = word.toLocaleLowerCase('tr-TR');
  for (let i = w.length - 1; i >= 0; i--) if (VOWELS.includes(w[i]!)) return w[i]!;
  return 'e';
}

/** Bulunma eki: "Ayşe'de", "Mert'te", "Kasım'da". */
export function locative(word: string): string {
  const last = word.toLocaleLowerCase('tr-TR').slice(-1);
  const d = HARD.includes(last) ? 't' : 'd';
  const v = BACK_VOWELS.includes(lastVowel(word)) ? 'a' : 'e';
  return `${word}’${d}${v}`;
}

/** Yönelme eki: "Ayşe'ye", "Mert'e", "Kasım'a". */
export function dative(word: string): string {
  const last = word.toLocaleLowerCase('tr-TR').slice(-1);
  const v = BACK_VOWELS.includes(lastVowel(word)) ? 'a' : 'e';
  return `${word}’${VOWELS.includes(last) ? 'y' : ''}${v}`;
}

/** "6 Kasım’a kadar" */
export function untilText(iso: string): string {
  return `${dative(formatDate(iso))} kadar`;
}

/** "29 Ekim’di" (geçmiş tarih). */
export function wasText(iso: string): string {
  const date = formatDate(iso);
  const last = date.toLocaleLowerCase('tr-TR').slice(-1);
  const d = HARD.includes(last) ? 't' : 'd';
  const v = lastVowel(date);
  const harmony = 'aı'.includes(v) ? 'ı' : 'ou'.includes(v) ? 'u' : 'eiE'.includes(v) ? 'i' : 'ü';
  return `${date}’${d}${harmony}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toLocaleUpperCase('tr-TR'))
    .join('');
}

const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** "12 Eki" (bu yıl) ya da "12 Eki 2024". */
export function formatShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const base = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return d.getFullYear() !== new Date().getFullYear() ? `${base} ${d.getFullYear()}` : base;
}

/** "EKİM 2026" bölüm başlıkları için ay adı. */
export function monthYear(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** ISBN'i okunur gruplara ayırır: 978 975 07 0123 4. */
export function formatIsbn(isbn: string | null | undefined): string {
  if (!isbn) return '';
  return isbn.length === 13
    ? `${isbn.slice(0, 3)} ${isbn.slice(3, 6)} ${isbn.slice(6, 8)} ${isbn.slice(8, 12)} ${isbn.slice(12)}`
    : isbn;
}
