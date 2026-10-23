import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/migrate.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  // Ortak paket TypeScript kaynağı olarak duruyor; derlenmiş çıktıya gömülmeli.
  noExternal: ['@kitaplik/shared'],
});
