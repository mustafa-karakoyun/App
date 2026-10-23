// drizzle-kit'in ürettiği .sql dosyalarını tek bir TS modülüne gömer.
// Böylece Metro'ya .sql içe aktarma eklentisi gerekmiyor.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const journal = JSON.parse(readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
const migrations = {};
for (const entry of journal.entries) {
  const key = `m${String(entry.idx).padStart(4, '0')}`;
  migrations[key] = readFileSync(path.join(root, 'drizzle', `${entry.tag}.sql`), 'utf8');
}
const out = `// Bu dosya otomatik üretildi: npm run db:generate\n\nexport default ${JSON.stringify({ journal, migrations }, null, 2)};\n`;
writeFileSync(path.join(root, 'src/db/migrations.ts'), out);
import('node:fs').then((fs) => fs.rmSync(path.join(root, 'drizzle/migrations.js'), { force: true }));
console.log(`${journal.entries.length} migration src/db/migrations.ts dosyasına yazıldı`);
