// ISBN-10 / ISBN-13 doğrulama ve dönüştürme. Barkod okuyucudan gelen EAN-13
// değerleri 978/979 ile başlıyorsa ISBN'dir.

export function cleanIsbn(input: string): string {
  return input.replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function isValidIsbn10(isbn: string): boolean {
  const s = cleanIsbn(isbn);
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const c = s[i]!;
    const v = c === 'X' ? 10 : Number(c);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

function isbn13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidIsbn13(isbn: string): boolean {
  const s = cleanIsbn(isbn);
  if (!/^97[89]\d{10}$/.test(s)) return false;
  return isbn13CheckDigit(s.slice(0, 12)) === Number(s[12]);
}

export function isbn10To13(isbn10: string): string | null {
  const s = cleanIsbn(isbn10);
  if (!isValidIsbn10(s)) return null;
  const first12 = '978' + s.slice(0, 9);
  return first12 + isbn13CheckDigit(first12);
}

/** Geçerli bir ISBN'i 13 haneli forma çevirir, değilse null döner. */
export function toIsbn13(input: string): string | null {
  const s = cleanIsbn(input);
  if (s.length === 13 && isValidIsbn13(s)) return s;
  if (s.length === 10) return isbn10To13(s);
  return null;
}

/** Barkod tarayıcıdan gelen değer bir kitap barkodu mu? */
export function isBookBarcode(data: string): boolean {
  return toIsbn13(data) !== null;
}
