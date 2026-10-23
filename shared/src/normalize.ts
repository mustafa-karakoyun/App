// Türkçe metin normalleştirme: arama ve eşleştirmede "SUÇ VE CEZA", "Suc ve Ceza"
// ve "suç ve ceza" aynı anahtara düşmeli.

const FOLD_MAP: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  á: 'a',
  à: 'a',
  ä: 'a',
  ó: 'o',
  ò: 'o',
  ô: 'o',
  ú: 'u',
  ù: 'u',
  í: 'i',
  ì: 'i',
  ï: 'i',
  ñ: 'n',
};

/** Türkçe kurallarıyla küçük harfe çevirir (İ→i, I→ı). */
export function turkishLower(input: string): string {
  return input.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
}

/**
 * Karşılaştırma anahtarı üretir: Türkçe küçük harf, aksan ve Türkçe karakterleri
 * ASCII'ye katlar, noktalamayı atar, boşlukları tekler.
 */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return '';
  const lowered = turkishLower(input.normalize('NFC'));
  let out = '';
  for (const ch of lowered) {
    out += FOLD_MAP[ch] ?? ch;
  }
  return out
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PUBLISHER_SUFFIXES = [
  'yayinlari',
  'yayinevi',
  'yayincilik',
  'yayin grubu',
  'yayinlar',
  'yayin',
  'kitaplari',
  'kitap',
  'basim',
  'publishing',
  'publishers',
  'press',
  'books',
  'ltd sti',
  'as',
];

const PUBLISHER_ALIASES: Record<string, string> = {
  yky: 'yapi kredi',
  'yapi kredi kultur sanat': 'yapi kredi',
  'turkiye is bankasi kultur': 'is bankasi',
  'is bankasi kultur': 'is bankasi',
  'is kultur': 'is bankasi',
  'tib kultur': 'is bankasi',
  'iletisim': 'iletisim',
  'can sanat': 'can',
  'everest': 'everest',
  'dogan kitap': 'dogan',
  'ithaki': 'ithaki',
  'metis': 'metis',
  'sel': 'sel',
};

/** Yayınevi adını "İletişim Yayınları" → "iletisim" gibi çekirdek ada indirger. */
export function normalizePublisher(input: string | null | undefined): string {
  let s = normalizeText(input);
  if (!s) return '';
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of PUBLISHER_SUFFIXES) {
      if (s.endsWith(' ' + suffix)) {
        s = s.slice(0, -suffix.length - 1).trim();
        changed = true;
      }
    }
  }
  return PUBLISHER_ALIASES[s] ?? s;
}

/** Yazar adındaki "Fyodor M. Dostoyevski" gibi baş harfleri ve fazlalıkları temizler. */
export function normalizeAuthor(input: string | null | undefined): string {
  return normalizeText(input)
    .split(' ')
    .filter((t) => t.length > 1)
    .join(' ');
}

/** Başlıktaki alt başlığı ("Suç ve Ceza: Roman") ayırıp ana başlığı normalleştirir. */
export function normalizeTitle(input: string | null | undefined): string {
  if (!input) return '';
  const main = input.split(/[:;(\[]/)[0] ?? input;
  return normalizeText(main);
}
