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
    const response = await this.client.responses.create({
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
    this.lastUsage = response.usage
      ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
      : null;
    return shelfOutputSchema.parse(JSON.parse(response.output_text));
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
