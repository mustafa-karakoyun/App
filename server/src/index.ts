import { buildApp } from './app';
import { createProviders } from './books/providers';
import { loadConfig } from './config';
import { createDb } from './db';
import { migrate } from './migrate';
import { MockVisionProvider, OpenAIVisionProvider } from './scan/vision';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
await migrate(db, console.log);

const vision =
  config.VISION_PROVIDER === 'openai'
    ? new OpenAIVisionProvider(config.OPENAI_API_KEY!, config.OPENAI_VISION_MODEL)
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
if (vision.name === 'mock') {
  app.log.warn(
    'Raf tarama sahte (mock) yanıtla çalışıyor. Gerçek tarama için VISION_PROVIDER=openai ve OPENAI_API_KEY girin.',
  );
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await db.end();
    process.exit(0);
  });
}
