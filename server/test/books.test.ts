import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, jpeg, multipart, registerUser } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('kitap kataloğu', () => {
  it('ISBN ile bulur ve ikinci aramada dışarıya sormaz', async () => {
    const first = await ctx.app.inject({ method: 'GET', url: '/books/isbn/978-975-07-1938-7' });
    expect(first.statusCode).toBe(200);
    expect(first.json().title).toBe('Suç ve Ceza');
    expect(ctx.providers.isbnCalls).toBe(1);

    const second = await ctx.app.inject({ method: 'GET', url: '/books/isbn/9789750719387' });
    expect(second.json().id).toBe(first.json().id);
    expect(ctx.providers.isbnCalls).toBe(1);
  });

  it('bulunamayan ISBN için 404 döner', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/books/isbn/9780306406157' });
    expect(res.statusCode).toBe(404);
  });

  it('katalogda Türkçe karakterden bağımsız arar', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/books/search?q=suc ve ceza' });
    expect(res.json().books[0].title).toBe('Suç ve Ceza');
  });

  it('elle eklenen kitap üç farklı kullanıcıdan sonra doğrulanır', async () => {
    const input = { title: 'Yerel Bir Şiir Kitabı', authors: ['Ayşe Yılmaz'], publisher: 'Küçük Yayınevi' };
    let id = '';
    for (let i = 1; i <= 3; i++) {
      const { headers } = await registerUser(ctx.app, `elle${i}@example.com`);
      const res = await ctx.app.inject({ method: 'POST', url: '/books', headers, payload: input });
      expect(res.statusCode).toBe(201);
      const book = res.json();
      if (i === 1) id = book.id;
      expect(book.id).toBe(id);
      expect(book.verified).toBe(i === 3);
    }
  });

  it('istemcinin verdiği id ile elle kitap oluşturur', async () => {
    const { headers } = await registerUser(ctx.app, 'idli@example.com');
    const id = '6f1c2b8e-1d2a-4c3b-9a8e-123456789abc';
    const res = await ctx.app.inject({ method: 'POST', url: '/books', headers, payload: { id, title: 'Çevrimdışı Kitap', authors: [] } });
    expect(res.json().id).toBe(id);
    // Aynı istek tekrar gelirse (yeniden deneme) aynı kitap döner.
    const again = await ctx.app.inject({ method: 'POST', url: '/books', headers, payload: { id, title: 'Çevrimdışı Kitap', authors: [] } });
    expect(again.json().id).toBe(id);
  });

  it('kapağı olmayan kitaba kapak yükler', async () => {
    const { headers } = await registerUser(ctx.app, 'kapak@example.com');
    const created = await ctx.app.inject({ method: 'POST', url: '/books', headers, payload: { title: 'Kapaksız', authors: ['Biri'] } });
    const body = multipart('photo', await jpeg(600, 900), 'kapak.jpg');
    const res = await ctx.app.inject({ method: 'POST', url: `/books/${created.json().id}/cover`, headers: { ...headers, ...body.headers }, payload: body.payload });
    expect(res.statusCode).toBe(200);
    expect(res.json().cover_url).toMatch(/\/uploads\/covers\/.+\.jpg$/);

    const file = await ctx.app.inject({ method: 'GET', url: new URL(res.json().cover_url).pathname });
    expect(file.statusCode).toBe(200);
  });

  it('başkasının kapağını değiştirmeye izin vermez', async () => {
    const { headers } = await registerUser(ctx.app, 'kapak2@example.com');
    const book = (await ctx.app.inject({ method: 'GET', url: '/books/isbn/9789750719387' })).json();
    const body = multipart('photo', await jpeg(), 'kapak.jpg');
    const res = await ctx.app.inject({ method: 'POST', url: `/books/${book.id}/cover`, headers: { ...headers, ...body.headers }, payload: body.payload });
    expect(res.statusCode).toBe(403);
  });
});
