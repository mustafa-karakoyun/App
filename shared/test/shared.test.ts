import { describe, expect, it } from 'vitest';
import {
  classifyMatch,
  cleanIsbn,
  isbn10To13,
  isValidIsbn13,
  matchScore,
  normalizeAuthor,
  normalizePublisher,
  normalizeText,
  normalizeTitle,
  toIsbn13,
  turkishLower,
} from '../src';

describe('Türkçe normalleştirme', () => {
  it('İ/I harflerini Türkçe kuralla küçültür', () => {
    expect(turkishLower('İSTANBUL')).toBe('istanbul');
    expect(turkishLower('IŞIK')).toBe('ışık');
  });

  it('büyük harf, aksansız ve Türkçe karakterli yazımları aynı anahtara indirger', () => {
    const keys = ['SUÇ VE CEZA', 'Suç ve Ceza', 'suc ve ceza', 'SUC VE CEZA', ' Suç  ve-Ceza! '].map(normalizeText);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('suc ve ceza');
  });

  it('ğ, ş, ö, ü, ı, â karakterlerini katlar', () => {
    expect(normalizeText('Ağaçlar Ölüm Şarkısı Kâğıt Üzüm')).toBe('agaclar olum sarkisi kagit uzum');
  });

  it('başlıktaki alt başlığı atar', () => {
    expect(normalizeTitle('Tutunamayanlar: Roman')).toBe('tutunamayanlar');
    expect(normalizeTitle('Kürk Mantolu Madonna (Ciltli)')).toBe('kurk mantolu madonna');
  });

  it('yayınevi ekleri ve kısaltmalarını temizler', () => {
    expect(normalizePublisher('İletişim Yayınları')).toBe('iletisim');
    expect(normalizePublisher('ILETISIM')).toBe('iletisim');
    expect(normalizePublisher('Yapı Kredi Yayınları')).toBe('yapi kredi');
    expect(normalizePublisher('YKY')).toBe('yapi kredi');
    expect(normalizePublisher('Türkiye İş Bankası Kültür Yayınları')).toBe('is bankasi');
    expect(normalizePublisher('Can Yayınları')).toBe('can');
  });

  it('yazar adındaki baş harfleri atar', () => {
    expect(normalizeAuthor('Fyodor M. Dostoyevski')).toBe('fyodor dostoyevski');
  });
});

describe('ISBN', () => {
  it('ISBN-13 doğrular', () => {
    expect(isValidIsbn13('978-975-07-1938-7')).toBe(true);
    expect(isValidIsbn13('9789750719388')).toBe(false);
  });

  it('ISBN-10 → ISBN-13 dönüştürür', () => {
    expect(isbn10To13('0-306-40615-2')).toBe('9780306406157');
    expect(isbn10To13('080442957X')).toBe('9780804429573');
  });

  it('geçersiz barkodları reddeder', () => {
    expect(toIsbn13('4006381333931')).toBeNull(); // EAN ama kitap değil
    expect(toIsbn13('abc')).toBeNull();
    expect(cleanIsbn('978-975 07')).toBe('97897507');
  });
});

describe('eşleştirme', () => {
  const sucVeCeza = { title: 'Suç ve Ceza', authors: ['Fyodor Mihayloviç Dostoyevski'], publisher: 'İletişim Yayınları' };
  const budala = { title: 'Budala', authors: ['Fyodor Dostoyevski'], publisher: 'İletişim Yayınları' };

  it('model çıktısı doğru kitapla yüksek puan alır', () => {
    const q = { title: 'SUC VE CEZA', author: 'DOSTOYEVSKI', publisher: 'ILETISIM' };
    expect(matchScore(q, sucVeCeza)).toBeGreaterThan(0.85);
    expect(matchScore(q, budala)).toBeLessThan(0.5);
  });

  it('yazar sırası farklı olsa da eşleşir', () => {
    expect(matchScore({ title: 'Budala', author: 'Dostoyevski Fyodor' }, budala)).toBeGreaterThan(0.9);
  });

  it('sınıflandırma eşik ve farka bakar', () => {
    expect(classifyMatch([0.95, 0.4])).toBe('matched');
    expect(classifyMatch([0.9, 0.86])).toBe('verify');
    expect(classifyMatch([0.6])).toBe('verify');
    expect(classifyMatch([0.2])).toBe('not_found');
    expect(classifyMatch([])).toBe('not_found');
  });
});
