import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  PUBLIC_URL: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().default('postgres://kitaplik:kitaplik@localhost:5432/kitaplik'),
  JWT_SECRET: z.string().min(8),
  VISION_PROVIDER: z.enum(['openai', 'mock']).default('mock'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_VISION_MODEL: z.string().default('gpt-4.1'),
  SCAN_MONTHLY_LIMIT: z.coerce.number().int().positive().default(20),
  GOOGLE_BOOKS_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_IDS: z.string().optional(),
  UPLOAD_DIR: z.string().default('uploads'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    throw new Error(`Geçersiz ortam değişkenleri: ${z.prettifyError(parsed.error)}`);
  }
  if (parsed.data.VISION_PROVIDER === 'openai' && !parsed.data.OPENAI_API_KEY) {
    throw new Error('VISION_PROVIDER=openai için OPENAI_API_KEY gerekli');
  }
  return parsed.data;
}
