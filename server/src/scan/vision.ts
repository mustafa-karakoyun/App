import OpenAI from 'openai';
import { z } from 'zod';

// Görsel dil modelinden istenen çıktı; proje planındaki şemanın aynısı.
export const shelfOutputSchema = z.object({
  books: z.array(
    z.object({
      position: z.number().int(),
      raw_text: z.string(),
      title: z.string().nullable(),
      author: z.string().nullable(),
      publisher: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  unreadable_count: z.number().int().min(0),
});

export type ShelfOutput = z.infer<typeof shelfOutputSchema>;

export interface VisionUsage {
  input_tokens: number;
  output_tokens: number;
}

/**
 * Görsel model hatasının türü: kullanıcıya doğru mesajı göstermek için.
 * auth: anahtar geçersiz/yetkisiz · config: model adı yanlış · busy: kota/hız sınırı · other: diğer.
 */
export type VisionErrorKind = 'auth' | 'config' | 'busy' | 'other';

export class VisionError extends Error {
  constructor(
    readonly kind: VisionErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** Modelin döndürdüğü JSON'u doğrular; güven değeri aralık dışıysa sıkıştırır. */
function parseShelf(text: string): ShelfOutput {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new VisionError('other', 'Model geçerli JSON döndürmedi');
  }
  const r = raw as { books?: { confidence?: number }[] };
  for (const b of r.books ?? []) {
    if (typeof b.confidence === 'number') b.confidence = Math.min(1, Math.max(0, b.confidence));
  }
  return shelfOutputSchema.parse(raw);
}

export interface VisionProvider {
  readonly name: string;
  readShelf(image: Buffer, mimeType: string): Promise<ShelfOutput>;
  /** Son çağrının token kullanımı (maliyet ölçümü için); sağlayıcı bildirmiyorsa null. */
  lastUsage?: VisionUsage | null;
}

export const SHELF_PROMPT = `Bu fotoğraf bir kitaplık rafını gösteriyor. Sırtı görünen her kitabı soldan sağa sırayla listele.

Kurallar:
- position: soldan sağa 1'den başlayan sıra.
- raw_text: sırtta okuduğun metnin tamamı, olduğu gibi (büyük harf, kısaltma dahil).
- title, author, publisher: sırttaki metinden çıkardığın başlık, yazar ve yayınevi. Türkçe karakterleri doğru yaz (ç, ğ, ı, İ, ö, ş, ü). Emin olmadığın alanı null bırak.
- Fotoğrafta görmediğin hiçbir kitabı ekleme; bilgini kullanarak başlık tamamlama, yalnızca okuduğunu yaz.
- confidence: okumana ne kadar güvendiğin, 0 ile 1 arası.
- unreadable_count: kitap olduğu belli ama sırtı okunamayan (çok ince, eğik, karanlık) kitap sayısı.`;

// OpenAI strict JSON şeması: tüm alanlar zorunlu, null'a izin verilenler tip dizisiyle.
const OPENAI_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['books', 'unreadable_count'],
  properties: {
    books: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['position', 'raw_text', 'title', 'author', 'publisher', 'confidence'],
        properties: {
          position: { type: 'integer' },
          raw_text: { type: 'string' },
          title: { type: ['string', 'null'] },
          author: { type: ['string', 'null'] },
          publisher: { type: ['string', 'null'] },
          confidence: { type: 'number' },
        },
      },
    },
    unreadable_count: { type: 'integer' },
  },
} as const;

export class OpenAIVisionProvider implements VisionProvider {
  readonly name = 'openai';
  lastUsage: VisionUsage | null = null;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey, timeout: 90_000, maxRetries: 1 });
  }

  async readShelf(image: Buffer, mimeType: string): Promise<ShelfOutput> {
    let response;
    try {
      response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: SHELF_PROMPT },
              { type: 'input_image', image_url: `data:${mimeType};base64,${image.toString('base64')}`, detail: 'high' },
            ],
          },
        ],
        text: {
          format: { type: 'json_schema', name: 'shelf_books', schema: OPENAI_JSON_SCHEMA, strict: true },
        },
      });
    } catch (err) {
      const status = (err as { status?: number }).status;
      const message = (err as Error).message;
      if (status === 401 || status === 403) throw new VisionError('auth', message);
      if (status === 404) throw new VisionError('config', message);
      if (status === 429) throw new VisionError('busy', message);
      throw new VisionError('other', message);
    }
    this.lastUsage = response.usage
      ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
      : null;
    return parseShelf(response.output_text);
  }
}

// Gemini yapılandırılmış çıktı şeması (OpenAPI alt kümesi): null olabilen alanlar `nullable`.
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  required: ['books', 'unreadable_count'],
  properties: {
    books: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['position', 'raw_text', 'title', 'author', 'publisher', 'confidence'],
        properties: {
          position: { type: 'INTEGER' },
          raw_text: { type: 'STRING' },
          title: { type: 'STRING', nullable: true },
          author: { type: 'STRING', nullable: true },
          publisher: { type: 'STRING', nullable: true },
          confidence: { type: 'NUMBER' },
        },
        propertyOrdering: ['position', 'raw_text', 'title', 'author', 'publisher', 'confidence'],
      },
    },
    unreadable_count: { type: 'INTEGER' },
  },
} as const;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string; details?: { reason?: string }[] };
}

/** Google Gemini (Generative Language API, REST). SDK yerine fetch: tek bir çağrı için yeterli. */
export class GeminiVisionProvider implements VisionProvider {
  readonly name = 'gemini';
  lastUsage: VisionUsage | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async readShelf(image: Buffer, mimeType: string): Promise<ShelfOutput> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: SHELF_PROMPT }, { inline_data: { mime_type: mimeType, data: image.toString('base64') } }],
            },
          ],
          generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA, temperature: 0 },
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      throw new VisionError('other', `Gemini'ye ulaşılamadı: ${(err as Error).message}`);
    }

    const body = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok || body.error) {
      const message = body.error?.message ?? `Gemini ${res.status}`;
      const reasons = (body.error?.details ?? []).map((d) => d.reason);
      if (res.status === 401 || res.status === 403 || reasons.includes('API_KEY_INVALID')) {
        throw new VisionError('auth', message);
      }
      if (res.status === 404) throw new VisionError('config', message);
      if (res.status === 429) throw new VisionError('busy', message);
      throw new VisionError('other', message);
    }

    this.lastUsage = body.usageMetadata
      ? {
          input_tokens: body.usageMetadata.promptTokenCount ?? 0,
          output_tokens: body.usageMetadata.candidatesTokenCount ?? 0,
        }
      : null;
    const candidate = body.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) {
      const reason = body.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'boş yanıt';
      throw new VisionError('other', `Gemini yanıt vermedi (${reason})`);
    }
    return parseShelf(text);
  }
}

/**
 * API anahtarı yokken uçtan uca akışı denemek için sabit yanıt. Gerçek bir
 * rafı taklit eder: birkaç net eşleşme, bir belirsiz, bir bulunamayan.
 */
export class MockVisionProvider implements VisionProvider {
  readonly name = 'mock';

  constructor(private readonly output: ShelfOutput = MOCK_SHELF) {}

  async readShelf(): Promise<ShelfOutput> {
    return structuredClone(this.output);
  }
}

export const MOCK_SHELF: ShelfOutput = {
  books: [
    {
      position: 1,
      raw_text: 'DOSTOYEVSKI SUC VE CEZA ILETISIM',
      title: 'Suç ve Ceza',
      author: 'Fyodor Dostoyevski',
      publisher: 'İletişim',
      confidence: 0.92,
    },
    {
      position: 2,
      raw_text: 'SABAHATTIN ALI KURK MANTOLU MADONNA YKY',
      title: 'Kürk Mantolu Madonna',
      author: 'Sabahattin Ali',
      publisher: 'Yapı Kredi',
      confidence: 0.95,
    },
    {
      position: 3,
      raw_text: 'OGUZ ATAY TUTUNAMAYANLAR',
      title: 'Tutunamayanlar',
      author: 'Oğuz Atay',
      publisher: 'İletişim',
      confidence: 0.88,
    },
    {
      position: 4,
      raw_text: 'ORHAN PAMUK MASUMIYET',
      title: 'Masumiyet',
      author: 'Orhan Pamuk',
      publisher: null,
      confidence: 0.55,
    },
    { position: 5, raw_text: 'Y.K. BEYAZ GEC', title: 'Beyaz Gece', author: null, publisher: null, confidence: 0.3 },
  ],
  unreadable_count: 1,
};
