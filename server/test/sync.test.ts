import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let bookId: string;
beforeAll(async () => {
  ctx = await createTestApp();
  bookId = (await ctx.app.inject({ method: 'GET', url: '/books/isbn/9789750719387' })).json().id;
});
afterAll(() => ctx.close());

const t = (offsetSec = 0) => new Date(Date.now() + offsetSec * 1000).toISOString();

function changes(partial: Partial<Record<'locations' | 'user_books' | 'loans' | 'notes', unknown[]>>) {
  return { changes: { locations: [], user_books: [], loans: [], notes: [], ...partial } };
}

describe('senkronizasyon', () => {
  it('ikinci cihaz ilk cihazın kayıtlarını çeker', async () => {
    const { headers } = await registerUser(ctx.app, 'cihaz@example.com');
    const locId = randomUUID();
    const ubId = randomUUID();
    const push = await ctx.app.inject({
      method: 'POST',
      url: '/sync/push',
      headers,
      payload: changes({
        locations: [{ id: locId, name: 'Salon', parent_id: null, updated_at: t(), deleted_at: null }],
        user_books: [
          {
            id: ubId,
            book_id: bookId,
            status: 'read',
            location_id: locId,
            added_via: 'barcode',
            created_at: t(),
            updated_at: t(),
            deleted_at: null,
          },
        ],
        loans: [
          {
            id: randomUUID(),
            user_book_id: ubId,
            borrower_name: 'Ayşe',
            lent_at: t(),
            due_at: t(86400 * 14),
            returned_at: null,
            updated_at: t(),
            deleted_at: null,
          },
        ],
      }),
    });
    expect(push.statusCode).toBe(200);
    expect(push.json().rejected).toEqual([]);

    const pull = await ctx.app.inject({ method: 'GET', url: '/sync/pull', headers });
    const body = pull.json();
    expect(body.changes.locations).toHaveLength(1);
    expect(body.changes.user_books[0]).toMatchObject({ id: ubId, status: 'read', location_id: locId });
    expect(body.changes.loans[0].borrower_name).toBe('Ayşe');
    expect(body.books[0].title).toBe('Suç ve Ceza');

    // Hemen ardından gelen pull, güvenlik payı nedeniyle aynı kayıtları tekrar verebilir; ileri bir zaman boş döner.
    const later = await ctx.app.inject({
      method: 'GET',
      url: `/sync/pull?since=${encodeURIComponent(t(60))}`,
      headers,
    });
    expect(later.json().changes.user_books).toHaveLength(0);
  });

  it('son yazan kazanır: eski tarihli güncelleme reddedilir', async () => {
    const { headers } = await registerUser(ctx.app, 'lww@example.com');
    const id = randomUUID();
    const base = { id, book_id: bookId, location_id: null, added_via: 'manual', created_at: t(-100), deleted_at: null };
    await ctx.app.inject({
      method: 'POST',
      url: '/sync/push',
      headers,
      payload: changes({ user_books: [{ ...base, status: 'reading', updated_at: t(-10) }] }),
    });

    const stale = await ctx.app.inject({
      method: 'POST',
      url: '/sync/push',
      headers,
      payload: changes({ user_books: [{ ...base, status: 'to_read', updated_at: t(-50) }] }),
    });
    expect(stale.json().rejected).toEqual([id]);

    const fresh = await ctx.app.inject({
      method: 'POST',
      url: '/sync/push',
      headers,
      payload: changes({ user_books: [{ ...base, status: 'read', updated_at: t() }] }),
    });
    expect(fresh.json().rejected).toEqual([]);

    const pull = (await ctx.app.inject({ method: 'GET', url: '/sync/pull', headers })).json();
    expect(pull.changes.user_books[0].status).toBe('read');
  });

  it('silme işareti diğer cihaza taşınır', async () => {
    const { headers } = await registerUser(ctx.app, 'silme@example.com');
    const loc = { id: randomUUID(), name: 'Kutu 3', parent_id: null };
    await ctx.app.inject({
      method: 'POST',
      url: '/sync/push',
      headers,
      payload: changes({ locations: [{ ...loc, updated_at: t(-5), deleted_at: null }] }),
    });
    await ctx.app.inject({
      method: 'POST',
      url: '/sync/push',
      headers,
      payload: changes({ locations: [{ ...loc, updated_at: t(), deleted_at: t() }] }),
    });
    const pull = (await ctx.app.inject({ method: 'GET', url: '/sync/pull', headers })).json();
    expect(pull.changes.locations[0].deleted_at).not.toBeNull();
  });

  it('başka kullanıcının kaydını ve katalogda olmayan kitabı reddeder', async () => {
    const a = await registerUser(ctx.app, 'a@example.com');
    const b = await registerUser(ctx.app, 'b@example.com');
    const loc = { id: randomUUID(), name: 'A salonu', parent_id: null, deleted_at: null };
    await ctx.app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: a.headers,
      payload: changes({ locations: [{ ...loc, updated_at: t(-5) }] }),
    });

    const hijack = await ctx.app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: b.headers,
      payload: changes({ locations: [{ ...loc, name: 'Ele geçirildi', updated_at: t() }] }),
    });
    expect(hijack.json().rejected).toEqual([loc.id]);
    const aPull = (await ctx.app.inject({ method: 'GET', url: '/sync/pull', headers: a.headers })).json();
    expect(aPull.changes.locations[0].name).toBe('A salonu');

    const orphanId = randomUUID();
    const orphan = await ctx.app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: b.headers,
      payload: changes({
        user_books: [
          {
            id: orphanId,
            book_id: randomUUID(),
            status: 'to_read',
            location_id: null,
            added_via: 'barcode',
            created_at: t(),
            updated_at: t(),
            deleted_at: null,
          },
        ],
      }),
    });
    expect(orphan.json().rejected).toEqual([orphanId]);
  });

  it('geçersiz gövdeyi reddeder', async () => {
    const { headers } = await registerUser(ctx.app, 'gecersiz@example.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/sync/push',
      headers,
      payload: changes({ user_books: [{ id: 'x' }] }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('alıntı ve notları senkronlar, başka kullanıcıya göstermez', async () => {
    const a = await registerUser(ctx.app, 'notlar@example.com');
    const b = await registerUser(ctx.app, 'baskasi@example.com');
    const ubId = randomUUID();
    const quote = {
      id: randomUUID(),
      user_book_id: ubId,
      kind: 'quote',
      text: 'Dünyada en çok sevdiğim şey…',
      page: 142,
      created_at: t(),
      updated_at: t(),
      deleted_at: null,
    };
    const note = {
      id: randomUUID(),
      user_book_id: ubId,
      kind: 'note',
      text: 'Boğaz gezisi',
      page: null,
      created_at: t(),
      updated_at: t(),
      deleted_at: null,
    };
    const push = await ctx.app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: a.headers,
      payload: changes({ notes: [quote, note] }),
    });
    expect(push.json().rejected).toEqual([]);

    const pull = (await ctx.app.inject({ method: 'GET', url: '/sync/pull', headers: a.headers })).json();
    expect(pull.changes.notes).toHaveLength(2);
    expect(pull.changes.notes.find((n: { kind: string }) => n.kind === 'quote')).toMatchObject({
      page: 142,
      text: quote.text,
    });

    const other = (await ctx.app.inject({ method: 'GET', url: '/sync/pull', headers: b.headers })).json();
    expect(other.changes.notes).toHaveLength(0);

    const bad = await ctx.app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: a.headers,
      payload: changes({ notes: [{ ...quote, kind: 'ozet' }] }),
    });
    expect(bad.statusCode).toBe(400);
  });
});
