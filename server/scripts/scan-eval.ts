/**
 * Faz 0 ölçümü: raf tarama test seti.
 *
 *   npm run faz0:scan -- test-seti/
 *
 * Klasörde raf fotoğrafları (.jpg/.png) ve `cevaplar.json` bulunur:
 *   { "raf01.jpg": [{ "title": "Suç ve Ceza", "author": "Dostoyevski" }, ...], ... }
 *
 * Her fotoğraf sunucudaki hattın aynısıyla (küçültme, gerekirse parçalama) modele
 * gönderilir. Ölçülenler: tespit oranı (doğru cevaptaki kitapların kaçı okundu),
 * kesinlik (okunanların kaçı gerçekten rafta), süre ve token kullanımı.
 * Model ve sağlayıcı .env'deki VISION_PROVIDER / OPENAI_VISION_MODEL ile seçilir.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { matchScore } from '@kitaplik/shared';
import 'dotenv/config';
import { loadConfig } from '../src/config';
import { readShelf } from '../src/scan/pipeline';
import { MockVisionProvider, OpenAIVisionProvider, type VisionProvider } from '../src/scan/vision';

const dir = process.argv[2];
if (!dir) {
  console.error('Kullanım: npm run faz0:scan -- test-seti/');
  process.exit(1);
}

const config = loadConfig({ ...process.env, JWT_SECRET: process.env.JWT_SECRET || 'faz0-olcum' });
const vision: VisionProvider =
  config.VISION_PROVIDER === 'openai'
    ? new OpenAIVisionProvider(config.OPENAI_API_KEY!, config.OPENAI_VISION_MODEL)
    : new MockVisionProvider();
if (vision.name === 'mock') console.warn('Uyarı: VISION_PROVIDER=mock; sonuçlar anlamsız olur.');

type Truth = { title: string; author?: string };
const truth = JSON.parse(await readFile(path.join(dir, 'cevaplar.json'), 'utf8')) as Record<string, Truth[]>;
const photos = (await readdir(dir)).filter((f) => /\.(jpe?g|png|heic)$/i.test(f) && truth[f]);

/** Okunan bir kitap, doğru cevaptaki bir kitapla eşleşiyor mu? */
const SAME_BOOK = 0.75;

const results = [];
let totalTruth = 0;
let totalDetected = 0;
let totalRead = 0;
let totalCorrectRead = 0;
let totalMs = 0;
let inputTokens = 0;
let outputTokens = 0;

for (const file of photos) {
  const expected = truth[file]!;
  const started = Date.now();
  // Parçalama birden çok çağrı yapabilir; kullanımı toplamak için sarmala.
  let calls = 0;
  const usage = { input: 0, output: 0 };
  const counting: VisionProvider = {
    name: vision.name,
    async readShelf(image, mime) {
      calls++;
      const out = await vision.readShelf(image, mime);
      usage.input += vision.lastUsage?.input_tokens ?? 0;
      usage.output += vision.lastUsage?.output_tokens ?? 0;
      return out;
    },
  };
  const output = await readShelf(counting, await readFile(path.join(dir, file)));
  const ms = Date.now() - started;

  const readBooks = output.books.filter((b) => b.title);
  const detected = expected.filter((t) =>
    readBooks.some(
      (b) =>
        matchScore({ title: b.title!, author: b.author }, { title: t.title, authors: t.author ? [t.author] : [] }) >=
        SAME_BOOK,
    ),
  ).length;
  const correctRead = readBooks.filter((b) =>
    expected.some(
      (t) =>
        matchScore({ title: b.title!, author: b.author }, { title: t.title, authors: t.author ? [t.author] : [] }) >=
        SAME_BOOK,
    ),
  ).length;

  totalTruth += expected.length;
  totalDetected += detected;
  totalRead += readBooks.length;
  totalCorrectRead += correctRead;
  totalMs += ms;
  inputTokens += usage.input;
  outputTokens += usage.output;
  results.push({
    file,
    expected: expected.length,
    read: readBooks.length,
    detected,
    correctRead,
    unreadable: output.unreadable_count,
    calls,
    ms,
    ...usage,
  });
  console.log(
    `${file}: ${detected}/${expected.length} tespit, ${correctRead}/${readBooks.length} doğru okuma, ${calls} çağrı, ${(ms / 1000).toFixed(1)} sn`,
  );
}

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
console.log('\n--- Sonuç ---');
console.log(`Model: ${vision.name} ${config.OPENAI_VISION_MODEL}`);
console.log(`Fotoğraf: ${photos.length}`);
console.log(`Tespit oranı:  ${totalDetected}/${totalTruth}  ${pct(totalDetected, totalTruth)}`);
console.log(
  `Kesinlik:      ${totalCorrectRead}/${totalRead}  ${pct(totalCorrectRead, totalRead)}  (okunup rafta olmayan = uydurma)`,
);
console.log(`Ortalama süre: ${photos.length ? (totalMs / photos.length / 1000).toFixed(1) : '-'} sn / fotoğraf`);
console.log(
  `Token:         giriş ${inputTokens}, çıkış ${outputTokens} (fotoğraf başına ${photos.length ? Math.round(inputTokens / photos.length) : '-'} / ${photos.length ? Math.round(outputTokens / photos.length) : '-'})`,
);
console.log('Maliyet = token × modelin güncel birim fiyatı. Ücretsiz plan tarama limiti bu rakamla belirlenir.');

await writeFile('scan-eval.json', JSON.stringify({ model: config.OPENAI_VISION_MODEL, results }, null, 2) + '\n');
console.log('Ayrıntılar: scan-eval.json');
