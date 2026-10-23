# Kitaplık

Evdeki kitap koleksiyonunu raf fotoğrafıyla dijitalleştiren, internetsiz de çalışan koleksiyon yöneticisi.
Proje planındaki MVP kapsamı bu depoda: mobil uygulama (Expo / React Native) ve sunucu (Node.js + PostgreSQL).

```
shared/   İstemci ve sunucunun ortak kodu: Türkçe normalleştirme, ISBN, bulanık eşleştirme, API tipleri
server/   Fastify API: hesap, katalog, raf tarama, senkronizasyon (PostgreSQL + pg_trgm)
mobile/   Expo SDK 57 uygulaması: yerel SQLite, kamera, barkod, bildirimler
```

## Hızlı başlangıç

Gerekenler: Node.js 22, PostgreSQL 16 (ya da Docker), telefonda **Expo Go** (SDK 57 sürümü).

### 1. Veri tabanı

```bash
docker compose up -d db
```

Docker yoksa yerel PostgreSQL'de `kitaplik` adında bir kullanıcı ve veri tabanı oluşturun (şifre `kitaplik`).
`pg_trgm` eklentisini sunucu ilk açılışta kendisi kurar.

### 2. Sunucu

```bash
npm install
cp server/.env.example server/.env   # JWT_SECRET'ı değiştirin: openssl rand -hex 32
npm run dev --workspace server       # http://localhost:3000
```

Şema geçişleri açılışta otomatik uygulanır (`server/migrations/`). Raf tarama, OpenAI anahtarı girilene kadar
**sahte (mock) yanıtla** çalışır: her fotoğrafa aynı beş kitaplık örnek rafı döner. Böylece akışın tamamı anahtarsız denenebilir.

### 3. Mobil uygulama

```bash
cd mobile
npm install
npx expo start
```

Terminaldeki QR kodu telefondaki Expo Go ile okutun. Telefon ve bilgisayar aynı Wi-Fi ağındaysa uygulama sunucuyu
kendiliğinden bulur (Expo'yu çalıştıran bilgisayarın IP'si, port 3000). Farklı bir sunucu için
`mobile/.env` dosyasına `EXPO_PUBLIC_API_URL=https://...` yazın.

Kullanılan tüm yerel modüller (SQLite, kamera, barkod, yerel bildirim, güvenli depo) Expo Go'da hazır gelir;
ilk denemeler için ayrı derleme gerekmez.

## Gerçek raf taramayı açmak

`server/.env`:

```
VISION_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_VISION_MODEL=gpt-4.1     # görsel girdi ve JSON şeması destekleyen herhangi bir model
SCAN_MONTHLY_LIMIT=20           # ücretsiz planda aylık tarama hakkı
```

Hangi modelin seçileceğine ve limitin kaç olacağına Faz 0 ölçümleri karar verir (aşağıda).
`GOOGLE_BOOKS_API_KEY` boşsa Google Books anahtarsız sorulur. Bu durumda kota düşük kalır; gerçek kullanımda anahtar girin.

## Google ile giriş

Sunucu tarafı hazır (`POST /auth/google`), ama bu sürümde kapalı. Açmak için:

1. Google Cloud Console'da Android, iOS ve Web için OAuth istemci kimlikleri oluşturun.
2. `server/.env` → `GOOGLE_CLIENT_IDS=<android>,<ios>,<web>`
3. Mobilde `@react-native-google-signin/google-signin` ekleyin ve dönen `idToken`'ı `signInWithGoogle()` fonksiyonuna verin
   (`mobile/src/lib/auth.ts`). Bu kütüphane Expo Go'da yok; development build gerekir: `npx eas-cli build --profile development`.

## Kontroller

```bash
npm test                          # ortak paket + sunucu (sunucu testleri kitaplik_test veri tabanını kullanır)
npm run typecheck                 # üç paketin tip kontrolü
cd mobile && npx expo lint
npm run format                    # Prettier
```

Sunucu testleri için ayrı bir veri tabanı gerekir. Testler her dosyada şemayı silip yeniden kurar:

```bash
createdb -U kitaplik kitaplik_test   # ya da TEST_DATABASE_URL ile başka bir adres verin
```

## Faz 0 ölçüm araçları

Planın "kod yazmadan önce ölç" adımı için iki betik:

```bash
# Türkçe ISBN bulunma oranı: satır başına bir ISBN içeren dosya
npm run faz0:isbn --workspace server -- ~/isbnler.txt

# Raf tarama test seti: fotoğraflar + cevaplar.json
npm run faz0:scan --workspace server -- ~/test-seti/
```

`cevaplar.json` biçimi: `{ "raf01.jpg": [{ "title": "Suç ve Ceza", "author": "Dostoyevski" }] }`.
Tarama betiği tespit oranını, kesinliği (uydurma kitap oranı), fotoğraf başına süreyi ve token kullanımını raporlar.
Eşleştirme eşikleri `shared/src/match.ts` içindeki `MATCH_THRESHOLDS` sabitinde; ölçümden sonra buradan ayarlanır.

## Mimari notları

**Yerel öncelikli.** Kütüphane telefondaki SQLite'ta yaşar. Arama, filtre ve "bu bende var mı?" kontrolü internetsiz çalışır.
Her değişiklik bir giden kutusuna (`outbox`) yazılır. Senkronizasyon açılışta, uygulama öne gelince, internet geri gelince
ve yerel değişiklikten birkaç saniye sonra çalışır. Çakışmada son yazan (`updated_at`) kazanır. Silme, `deleted_at` işaretiyle yapılır.

**Hesap isteğe bağlı.** Uygulama hesapsız tam çalışır. Hesap, yedek ve cihazlar arası senkron içindir.
Raf tarama ise sunucu maliyeti ve kota yüzünden hesap ister. Hesap açılınca o ana kadar eklenen her şey sunucuya gider.

**Çevrimdışı ekleme.**
- Barkod: ISBN yer tutucu kitapla kaydedilir, internet gelince bilgiler ve kapak dolar.
- Elle ekleme: kitap yerelde oluşur, sunucuya aynı id ile gider.
- Raf fotoğrafı: kuyruğa alınır, işlenince yerel bildirim gelir.

**Raf tarama hattı** (`server/src/scan/`):
1. Görsel küçültülür.
2. Vision modelinden yapılandırılmış JSON alınır.
3. Okunamayan sırt çoksa fotoğraf üç parçaya bölünüp yeniden sorulur.
4. Her kitap için adaylar sırayla aranır: önceki kullanıcı onayları, katalog (pg_trgm), Google Books.
5. Kitaplar eşleşti / kontrol et / bulunamadı diye gruplanır.

Hiçbir kitap kullanıcı onayı olmadan eklenmez. Onaylar öğrenme döngüsüne yazılır, aynı sırt bir dahaki sefere doğrudan eşleşir.

**Katalog.** Her dış API yanıtı `books` tablosuna yazılır; aynı ISBN ikinci kez dışarı sorulmaz.
Elle eklenen kitap "doğrulanmamış" girer, üç farklı kullanıcı aynı bilgiyle eklerse doğrulanır.

**Gizlilik.** Raf fotoğrafı yalnızca bellekte işlenir, diske ya da veri tabanına yazılmaz. Ödünç alan kişinin yalnızca adı tutulur.
Uygulama içinden hesap silme var (mağaza kuralı).

## Yayına hazırlık

- Sunucu: `docker compose up -d` (veri tabanı + sunucu). İmaj `server/Dockerfile` ile depo kökünden derlenir.
- Mobil: `mobile/eas.json` içindeki `EXPO_PUBLIC_API_URL` değerini gerçek sunucu adresiyle değiştirin, sonra
  `npx eas-cli build --profile preview` (Android APK) ya da `--profile production` çalıştırın.
- Play Store'da kişisel hesaplar için 12 test kullanıcısıyla 14 günlük kapalı test şartı var (planın Faz 4'ü).

## Kapsam dışı / sonraki sürüm

v1.1: sayfadan alıntı (OCR) ve notlar, aylık istatistik kartları, CSV ve Goodreads içe/dışa aktarma.
Bilinçli olarak dışarıda: YZ ile kitap özeti, sosyal akış, e-kitap okuyucu.
