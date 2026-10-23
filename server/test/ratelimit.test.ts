import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestApp } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

it('giriş denemelerini sınırlar', async () => {
  const attempt = () =>
    ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'yok@example.com', password: 'yanlis-sifre' },
    });
  for (let i = 0; i < 20; i++) expect((await attempt()).statusCode).toBe(401);
  const blocked = await attempt();
  expect(blocked.statusCode).toBe(429);
  expect(blocked.json().error).toBe('rate_limited');
});
