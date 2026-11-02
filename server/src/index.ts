import { buildApp } from './app';
import { createProviders } from './books/providers';
import { loadConfig } from './config';
import { createDb } from './db';
import { migrate } from './migrate';
import { GeminiVisionProvider, MockVisionProvider, OpenAIVisionProvider } from './scan/vision';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
await migrate(db, console.log);

const vision =
  config.VISION_PROVIDER === 'openai'
    ? new OpenAIVisionProvider(config.OPENAI_API_KEY!, config.OPENAI_VISION_MODEL)
    : config.VISION_PROVIDER === 'gemini'
      ? new GeminiVisionProvider(config.GEMINI_API_KEY!, config.GEMINI_VISION_MODEL)
      : new MockVisionProvider();

const app = await buildApp(
  {
    config,
    db,
    vision,
    providers: createProviders(fetch, config.GOOGLE_BOOKS_API_KEY, (msg) => app.log.warn(msg)),
  },
  { logger: true },
);

await app.listen({ port: config.PORT, host: config.HOST });
app.log.info(`Raf tarama: ${vision.name}`);
if (vision.name === 'mock') {
  app.log.warn(
    'Raf tarama sahte (mock) yanıtla çalışıyor. Gerçek tarama için VISION_PROVIDER=gemini (GEMINI_API_KEY) ya da openai (OPENAI_API_KEY) girin.',
  );
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await db.end();
    process.exit(0);
  });
}
