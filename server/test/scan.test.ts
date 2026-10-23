import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mergeParts, shouldSplit } from '../src/scan/pipeline';
import { createTestApp, jpeg, multipart, registerUser } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

async function scan(headers: Record<string, string>) {
  const body = multipart('photo', await jpeg());
  return ctx.app.inject({
    method: 'POST',
    url: '/scans',
    headers: { ...headers, ...body.headers },
    payload: body.payload,
  });
}

describe('raf tarama', () => {
  it('oturum ister', async () => {
    const res = await scan({});
    expect(res.statusCode).toBe(401);
  });

  it('sahte model çıktısını eşleştirip üç gruba ayırır', async () => {
    const { headers } = await registerUser(ctx.app, 'tarayan@example.com');
    const res = await scan(headers);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const byPos = Object.fromEntries(body.items.map((i: { position: number }) => [i.position, i]));

    expect(byPos[1].group).toBe('matched');
    expect(byPos[1].candidates[0].book.title).toBe('Suç ve Ceza');
    expect(byPos[2].group).toBe('matched');
    expect(byPos[3].group).toBe('matched');
    // "Masumiyet" iki farklı kitaba benziyor: kullanıcı seçmeli.
    expect(byPos[4].group).toBe('verify');
    expect(byPos[4].candidates.length).toBeGreaterThanOrEqual(2);
    expect(byPos[5].group).toBe('not_found');
    expect(body.unreadable_count).toBe(1);
    expect(body.quota).toMatchObject({ used: 1, limit: 3 });
  });

  it('onaylanan seçim öğrenilir ve sonraki taramada doğrudan eşleşir', async () => {
    const { headers } = await registerUser(ctx.app, 'ogreten@example.com');
    const first = (await scan(headers)).json();
    const masumiyet = first.items.find((i: { position: number }) => i.position === 4);
    const pamuk = masumiyet.candidates.find((c: { book: { authors: string[] } }) =>
      c.book.authors.includes('Orhan Pamuk'),
    );

    const confirm = await ctx.app.inject({
      method: 'POST',
      url: `/scans/${first.scan_id}/confirm`,
      headers,
      payload: {
        items: [
          { position: 4, book_id: pamuk.book.id },
          { position: 5, book_id: null },
        ],
      },
    });
    expect(confirm.json().accepted).toBe(1);

    const second = (await scan(headers)).json();
    const again = second.items.find((i: { position: number }) => i.position === 4);
    expect(again.group).toBe('matched');
    expect(again.candidates[0].book.id).toBe(pamuk.book.id);
  });

  it('aylık kota dolunca 429 döner', async () => {
    const { headers } = await registerUser(ctx.app, 'kota@example.com');
    for (let i = 0; i < 3; i++) expect((await scan(headers)).statusCode).toBe(200);
    const res = await scan(headers);
    expect(res.statusCode).toBe(429);
    expect(res.json().quota.used).toBe(3);

    const quota = await ctx.app.inject({ method: 'GET', url: '/scans/quota', headers });
    expect(quota.json()).toMatchObject({ used: 3, limit: 3 });
  });

  it('bozuk görselde 400 döner ve kotadan düşmez', async () => {
    const { headers } = await registerUser(ctx.app, 'bozuk@example.com');
    const body = multipart('photo', Buffer.from('jpeg değil'));
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/scans',
      headers: { ...headers, ...body.headers },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(400);
    const quota = await ctx.app.inject({ method: 'GET', url: '/scans/quota', headers });
    expect(quota.json().used).toBe(0);
  });
});

describe('parçalı okuma', () => {
  const book = (position: number, title: string) => ({
    position,
    raw_text: title,
    title,
    author: null,
    publisher: null,
    confidence: 0.8,
  });

  it('okunamayan sırt çoksa parçalamaya karar verir', () => {
    expect(shouldSplit({ books: [book(1, 'A')], unreadable_count: 3 })).toBe(true);
    expect(
      shouldSplit({ books: Array.from({ length: 20 }, (_, i) => book(i + 1, `K${i}`)), unreadable_count: 3 }),
    ).toBe(false);
  });

  it('parçaları birleştirir ve örtüşen kitabı tekrar saymaz', () => {
    const merged = mergeParts([
      { books: [book(1, 'Budala'), book(2, 'Suç ve Ceza')], unreadable_count: 1 },
      { books: [book(1, 'SUC VE CEZA'), book(2, 'Ecinniler')], unreadable_count: 0 },
      { books: [book(1, 'Karamazov Kardeşler')], unreadable_count: 2 },
    ]);
    expect(merged.books.map((b) => b.title)).toEqual(['Budala', 'Suç ve Ceza', 'Ecinniler', 'Karamazov Kardeşler']);
    expect(merged.books.map((b) => b.position)).toEqual([1, 2, 3, 4]);
    expect(merged.unreadable_count).toBe(3);
  });
});
