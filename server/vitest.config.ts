import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Testler aynı test veri tabanını paylaşıyor.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://kitaplik:kitaplik@localhost:5432/kitaplik_test',
      JWT_SECRET: 'test-secret',
      VISION_PROVIDER: 'mock',
    },
  },
});
