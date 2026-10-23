import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('kimlik doğrulama', () => {
  it('kayıt olur, giriş yapar ve kendini görür', async () => {
    const { headers } = await registerUser(ctx.app, 'Ali@Example.com');
    const me = await ctx.app.inject({ method: 'GET', url: '/auth/me', headers });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe('ali@example.com');

    const login = await ctx.app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ali@example.com', password: 'gizli-sifre' } });
    expect(login.statusCode).toBe(200);
    expect(login.json().token).toBeTruthy();
  });

  it('aynı e-postayla ikinci kaydı reddeder', async () => {
    await registerUser(ctx.app, 'iki@example.com');
    const res = await ctx.app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'iki@example.com', password: 'baska-sifre' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('email_taken');
  });

  it('hatalı şifre ve kısa şifreyi reddeder', async () => {
    const wrong = await ctx.app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'iki@example.com', password: 'yanlis-sifre' } });
    expect(wrong.statusCode).toBe(401);
    const short = await ctx.app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'k@example.com', password: '123' } });
    expect(short.statusCode).toBe(400);
  });

  it('oturumsuz isteği reddeder', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('Google ile giriş yapılandırılmadıysa 501 döner', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/auth/google', payload: { id_token: 'x'.repeat(20) } });
    expect(res.statusCode).toBe(501);
  });

  it('hesabı siler', async () => {
    const { headers } = await registerUser(ctx.app, 'sil@example.com');
    const del = await ctx.app.inject({ method: 'DELETE', url: '/auth/me', headers });
    expect(del.statusCode).toBe(204);
    const me = await ctx.app.inject({ method: 'GET', url: '/auth/me', headers });
    expect(me.statusCode).toBe(401);
  });
});
