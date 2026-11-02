import { describe, expect, it } from 'vitest';
import { GeminiVisionProvider, VisionError, type VisionProvider } from '../src/scan/vision';
import { createTestApp, jpeg, multipart, registerUser } from './helpers';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('Gemini sağlayıcısı', () => {
  it('görseli ve JSON şemasını gönderir, yanıtı ayrıştırır', async () => {
    const shelf = {
      books: [
        { position: 1, raw_text: 'SUC VE CEZA', title: 'Suç ve Ceza', author: null, publisher: null, confidence: 1.2 },
      ],
      unreadable_count: 0,
    };
    const { fn, calls } = fakeFetch(200, {
      candidates: [{ content: { parts: [{ text: JSON.stringify(shelf) }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 80 },
    });
    const provider = new GeminiVisionProvider('anahtar', 'gemini-2.5-flash', fn);
    const out = await provider.readShelf(Buffer.from('jpeg'), 'image/jpeg');

    expect(out.books[0]).toMatchObject({ title: 'Suç ve Ceza', confidence: 1 });
    expect(provider.lastUsage).toEqual({ input_tokens: 1200, output_tokens: 80 });
    expect(calls[0]!.url).toContain('/models/gemini-2.5-flash:generateContent');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('anahtar');
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe('image/jpeg');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('hata türlerini ayırır', async () => {
    const cases: [number, unknown, string][] = [
      [400, { error: { code: 400, message: 'API key not valid', details: [{ reason: 'API_KEY_INVALID' }] } }, 'auth'],
      [403, { error: { code: 403, message: 'denied' } }, 'auth'],
      [404, { error: { code: 404, message: 'model not found' } }, 'config'],
      [429, { error: { code: 429, message: 'quota' } }, 'busy'],
      [200, { candidates: [], promptFeedback: { blockReason: 'SAFETY' } }, 'other'],
    ];
    for (const [status, body, kind] of cases) {
      const provider = new GeminiVisionProvider('k', 'm', fakeFetch(status, body).fn);
      const err = await provider.readShelf(Buffer.from('x'), 'image/jpeg').catch((e) => e);
      expect(err).toBeInstanceOf(VisionError);
      expect((err as VisionError).kind).toBe(kind);
    }
  });
});

describe('raf tarama hata yanıtı', () => {
  it('anahtar hatasını internet hatası gibi değil, ayrı kodla döner ve kotadan düşmez', async () => {
    const failing: VisionProvider = {
      name: 'gemini',
      async readShelf() {
        throw new VisionError('auth', 'API key not valid');
      },
    };
    const ctx = await createTestApp({ vision: failing });
    try {
      const { headers } = await registerUser(ctx.app, 'anahtar@example.com');
      const body = multipart('photo', await jpeg());
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/scans',
        headers: { ...headers, ...body.headers },
        payload: body.payload,
      });
      expect(res.statusCode).toBe(502);
      expect(res.json().error).toBe('vision_auth');
      const quota = await ctx.app.inject({ method: 'GET', url: '/scans/quota', headers });
      expect(quota.json().used).toBe(0);
    } finally {
      await ctx.close();
    }
  });
});
