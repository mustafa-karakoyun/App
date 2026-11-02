# Kitaplık — Proje Dokümanı

Bu belge, Kitaplık uygulamasında şimdiye kadar yapılan bütün işi anlatır: **ne yapıldı, neden böyle yapıldı ve
nasıl çalışıyor**. Yeni bir geliştirici (ya da yeni bir Claude oturumu) projeye bu belgeyi okuyarak devam edebilmelidir.

- Depo: `mustafa-karakoyun/App`, çalışma dalı: `claude/server-code-writing-62wh6u`
- Kurulum ve komutlar için: [`README.md`](../README.md)
- Tasarım agent'ına verilen brif: [`docs/tasarim-prompt.md`](tasarim-prompt.md)

---

## 1. Ürün özeti

Kitaplık, evdeki fiziksel kitap koleksiyonunu **tek bir raf fotoğrafıyla** dijitalleştiren ve **internet olmadan da
çalışan** bir koleksiyon yöneticisi. Sosyal okuma ağı değil (1000Kitap ve Goodreads ile yarışmıyor).

Rakiplerden ayrıldığı üç nokta (proje planından):

1. **Raf tarama:** Kitapları tek tek değil, raf raf eklemek.
2. **Türkçe kitaplarda doğru eşleşme:** Global API'lerin zayıf kaldığı yerde kendi katalog önbelleği ve kullanıcı düzeltmeleri.
3. **Fiziksel dünyaya bağlılık:** Kitabın hangi rafta durduğu, kime ödünç verildiği ve kitapçıdayken "bu bende var mı?" kontrolü.

Tasarımın etrafında döndüğü dört senaryo:

| Senaryo | Uygulamadaki karşılığı |
|---|---|
| İlk kurulum: 15 dakikada 200 kitap | Raf modu, onay listesi, "Tümünü seç", toplu konum atama |
| Kitapçıda: "Bu kitap sende, Salon / 2. raf" | Barkod modu, internetsiz yerel kontrol, bordo "BU KİTAP SENDE" kartı |
| Ödünç: iki dokunuşla kaydet, iade günü hatırlat | Ödünç ver alt sayfası, yerel bildirim |
| Bulma: "Dostoyevski hangi raftaydı?" | Türkçe karakter duyarsız yerel arama, konum satırı |

---

## 2. Çalışma süreci (kronolojik)

| Adım | Ne oldu | Commit |
|---|---|---|
| 1 | Kullanıcı proje planını (md) paylaştı; kapsam, model ve tasarım tercihleri soruldu | — |
| 2 | Expo SDK 57 iskeleti (kullanıcı 58 yerine 57 istedi) ve ortak paket | `8c98e59` |
| 3 | Sunucu: hesap, katalog, raf tarama, senkronizasyon + testler | `cb820fc` |
| 4 | Mobil veri katmanı: SQLite, giden kutusu, senkronizasyon motoru | `9d236a8` |
| 5 | Mobil ekranlar ve akışlar | `66c9180` |
| 6 | Tarayıcıda önizleme, ekran görüntüleriyle inceleme ve düzeltmeler | `2a50569` |
| 7 | Faz 0 ölçüm araçları, Docker, EAS profilleri, README | `24cea92` |
| 8 | Kod incelemesinde bulunan hatalar: senkronizasyon döngüsü vb. | `3296d90` |
| 9 | Çevrimdışı akış testi ve "geri dön" düzeltmesi | `88b2e2b` |
| 10 | Tasarım agent'ı için ekran brifi | `3a8b7f0` |
| 11 | Kullanıcının tasarımı (69 ekranlık spesifikasyon) koda uygulandı, notlar/alıntılar eklendi | `be2dce8`, `9f4ddcd`, `ce35025` |

### Kullanıcının verdiği kararlar

- **Kapsam:** MVP'nin tamamı (mobil + sunucu aynı depoda).
- **Görsel model:** OpenAI. Anahtar girilene kadar sahte (mock) yanıt.
- **Giriş:** Önce e-posta/şifre; Google ile giriş kodu hazır ama kapalı.
- **Tasarım:** Yoğun kart yok, gözü yormayan, kağıt tonları + koyu yeşil/bordo vurgu, UX ön planda.
- **Expo SDK:** 57.
- **Notlar ve alıntılar:** Planda v1.1'di; tasarımda olduğu için şimdi yapıldı.
- **"Sayfayı tara" (OCR):** Şimdilik yok; Expo Go'da çalışmadığı için "yakında" olarak duruyor.
- **Push:** Kullanıcı GitHub erişimini sonradan verdi; şu an her şey push'lu.

---

## 3. Mimari

```
┌────────────────────────── Telefon (Expo / React Native) ──────────────────────────┐
│  Ekranlar (expo-router)  →  veri katmanı (src/data)  →  SQLite (expo-sqlite+Drizzle) │
│                                   │  giden kutusu (outbox)                           │
│                                   ▼                                                  │
│                         senkronizasyon motoru (sync.ts)                              │
└───────────────────────────────────┬──────────────────────────────────────────────────┘
                                    │ HTTPS + JWT
┌───────────────────────────────────▼──────────── Sunucu (Fastify) ───────────────────┐
│  /auth  /books  /scans  /sync      PostgreSQL + pg_trgm                              │
│                  │                                                                   │
│                  ├── Google Books / Open Library (katalog)                           │
│                  └── OpenAI vision (raf fotoğrafı → JSON)                            │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Temel ilke: yerel öncelikli (local-first)

**Neden:** Plan, kitapçıda internetsiz "bu bende var mı?" kontrolü istiyordu. Ayrıca kütüphaneye göz atmak sunucuya
bağlı olmamalı.

**Nasıl:**
- Kütüphanenin doğru kopyası telefondaki SQLite'ta. Bütün okuma ve yazma yerelde ve anında yapılır.
- Her değişiklik `outbox` (giden kutusu) tablosuna kaydın id'siyle yazılır.
- Senkronizasyon giden kutusundaki kayıtların **son halini** sunucuya gönderir (push), sonra sunucudaki değişiklikleri çeker (pull).
- Çakışmada **son yazan kazanır** (`updated_at`). Tek kullanıcılı kütüphanede yeterli; ortak kütüphane gelirse alan bazlı birleştirmeye geçilir.
- Silme gerçek silme değil `deleted_at` işareti: silinen kayıt diğer cihaza da taşınabilsin diye.
- Pull, istemci saatine değil **sunucu saatine** (`server_updated_at`) bakar. Sunucu zamanı 30 sn geriden verilir; o an süren bir yazma bir sonraki pull'da kaçmasın diye. Aynı kaydın iki kez gelmesi zararsız.

### Hesap isteğe bağlı

**Neden:** İlk dakikada kayıt istemek kullanıcı kaybettirir; uygulama hesapsız da tam çalışmalı.

**Nasıl:**
- Hesapsız kullanıcı kitap ekleyebilir, barkod okutabilir, ödünç verebilir.
- Yalnızca raf tarama (sunucu maliyeti ve kota) ve bulut yedeği hesap ister.
- Hesap açılınca o ana kadarki giden kutusu sunucuya gider; mevcut kütüphane hesaba aktarılır.
- Farklı bir hesaba geçilirse önceki hesabın yerel verisi temizlenir (karışmasın diye).

### API anahtarları yalnızca sunucuda

OpenAI ve Google anahtarları telefona hiç girmez; telefon yalnızca kendi sunucumuzla konuşur. Böylece anahtar
çalınamaz, kota ve maliyet kontrol edilebilir.

---

## 4. Klasör yapısı

```
shared/      İstemci ve sunucunun ortak TypeScript kodu (npm workspace)
server/      Fastify API (npm workspace)
mobile/      Expo uygulaması (ayrı npm projesi; shared'ı file: bağımlılığıyla alır)
docs/        Bu belge ve tasarım brifi
docker-compose.yml, server/Dockerfile, .prettierrc
```

**Neden mobil ayrı npm projesi:** Expo/Metro'nun kendi bağımlılık sürümlerini (`npx expo install`) yönetmesi
gerekiyor. Sunucuyla aynı `node_modules`'ı paylaşmak React Native sürüm çakışmalarına açık.

---

## 5. Ortak paket (`shared/`)

| Dosya | Ne yapar | Neden |
|---|---|---|
| `normalize.ts` | Türkçe küçük harf (İ→i, I→ı), aksan/Türkçe karakter katlama, noktalama temizliği; yayınevi adlarını çekirdeğe indirme ("İletişim Yayınları" → `iletisim`, "YKY" → `yapi kredi`) | Model "SUC VE CEZA", kullanıcı "suç ve ceza" yazar; hepsi aynı anahtara düşmeli |
| `isbn.ts` | ISBN-10/13 doğrulama, 10→13 çevirme | Barkod EAN-13'tür; 978/979 değilse kitap değildir |
| `match.ts` | Trigram benzerliği (pg_trgm ile aynı mantık), kelime kümesi benzerliği, başlık %70 + yazar %30 puanı; eşikler (`MATCH_THRESHOLDS`) ve "eşleşti / kontrol et / bulunamadı" sınıflandırması | İstemci ve sunucu aynı puanı üretsin; eşikler Faz 0'da tek yerden ayarlansın |
| `types.ts` | API ve senkronizasyon tipleri (Book, UserBook, Location, Loan, Note, ScanResponse…) | Sözleşme tek yerde |

Önemli bir ayar: kelime kümesi benzerliği ilk sürümde yalnızca küçük kümeye bakıyordu; "Masumiyet" her "Masumiyet
Müzesi"ne tam puan veriyordu. Büyük kümenin de hesaba katıldığı ortalamaya çevrildi.

---

## 6. Sunucu (`server/`)

**Yığın:** Fastify 5, TypeScript, `pg`, zod (doğrulama), `@fastify/jwt`, bcryptjs, sharp (görsel işleme), OpenAI SDK,
`@fastify/rate-limit`, vitest.

### Veri modeli (`migrations/`)

| Tablo | İçerik |
|---|---|
| `users` | e-posta, şifre özeti, google_sub, plan (free/premium) |
| `books` | **Ortak katalog**: aynı baskı bin kullanıcıda bir kez. `normalized_title` üzerinde pg_trgm indeksi |
| `book_submissions` | Elle eklenen kitabı aynı bilgiyle ekleyen kullanıcılar; 3 olunca kitap doğrulanır |
| `scan_aliases` | Öğrenme döngüsü: "modelin okuduğu metin → kullanıcının onayladığı kitap" |
| `locations`, `user_books`, `loans`, `notes` | Kullanıcının kayıtları; istemcide üretilen UUID'ler (çevrimdışı oluşturma için) |
| `scans` | Tarama kaydı: model çıktısı ve eşleşme istatistikleri. **Fotoğraf saklanmaz** |

Kitabın kendisi (`books`) ile kullanıcının o kitapla ilişkisi (`user_books`) ayrı tutulur; durum, konum ve ödünç
kullanıcıya özeldir.

### Uç noktalar

| Uç nokta | Açıklama |
|---|---|
| `POST /auth/register`, `/auth/login` | E-posta/şifre, JWT (60 gün). Dakikada 20 istek sınırı |
| `POST /auth/google` | Google ID token doğrulama; `GOOGLE_CLIENT_IDS` yoksa 501 |
| `GET/DELETE /auth/me` | Kullanıcı bilgisi; hesap silme (mağaza kuralı) |
| `GET /books/isbn/:isbn` | Katalog → Google Books → Open Library. Bulunan her şey kataloğa yazılır, aynı ISBN ikinci kez dışarı sorulmaz. Hesap gerekmez |
| `GET /books/search?q=&external=1` | Katalogda bulanık arama, gerekirse Google Books |
| `POST /books` | Elle ekleme (istemcinin verdiği id ile; yeniden denemeye dayanıklı) |
| `POST /books/:id/cover` | Kapak yükleme (yalnızca kapaksız kitaba ya da kitabı ekleyene) |
| `GET /scans/quota`, `POST /scans` | Aylık kota; raf fotoğrafını işleme |
| `POST /scans/:id/confirm` | Kullanıcının son seçimleri → öğrenme döngüsü |
| `POST /sync/push`, `GET /sync/pull?since=` | Senkronizasyon (locations, user_books, loans, notes) |

### Raf tarama hattı (`scan/`)

1. **Görsel hazırlama:** Fotoğraf yönü düzeltilir, uzun kenar ~2000 px'e indirilir, JPEG'e sıkıştırılır (sharp).
2. **Model:** OpenAI Responses API'ye görsel ve **katı JSON şeması** gönderilir. Kitap başına sıra, ham metin, başlık, yazar, yayınevi ve güven değeri döner. Prompt'ta "görmediğin kitabı ekleme" kuralı var.
3. **Parçalama:** Okunamayan sırt sayısı yüksekse fotoğraf yatayda üç örtüşen parçaya bölünüp yeniden sorulur, sonuçlar birleştirilir. Planın "ince ve eğik sırtlar" yedek planı.
4. **Eşleştirme:** Önce `scan_aliases` (önceki onaylar), sonra katalog (pg_trgm), yetmezse Google Books. Adaylar `matchScore` ile puanlanır.
5. **Sınıflandırma:**
   - Puan ≥ 0,80 ve ikinci adaydan en az 0,08 önde ise "eşleşti".
   - Puan ≥ 0,50 ise "kontrol et".
   - Değilse "bulunamadı".
   - Model kendi okumasına güvenmiyorsa (< 0,6), daha önce onaylanmış bir eşleşme değilse "kontrol et"e düşer.
6. **Kota:** Ücretsiz planda aylık `SCAN_MONTHLY_LIMIT` (varsayılan 20). Başarısız taramalar kotadan düşmez.

**Sahte (mock) sağlayıcı:** Anahtar yokken her fotoğrafa aynı beş kitaplık örnek raf döner. Kurgu bilinçli: üç net
eşleşme, bir belirsiz ("Masumiyet": Pamuk mu Kulin mi), bir bulunamayan. Böylece akışın her dalı anahtarsız denenebilir.

### Senkronizasyon (`sync/routes.ts`)

- Push, toplu `INSERT … ON CONFLICT DO UPDATE … WHERE tablo.user_id = EXCLUDED.user_id AND tablo.updated_at < EXCLUDED.updated_at`.
- Böylece eski güncelleme ve başka kullanıcının id'si aynı sorguda reddedilir.
- Katalogda olmayan kitaba bağlı `user_books` kabul edilmez; istemci önce kitabı oluşturmalıdır.

### Testler (27)

Vitest, gerçek PostgreSQL test veri tabanıyla (`kitaplik_test`); dış API'ler ve model sahte. Kapsadıkları:
- **Hesap:** kayıt, giriş, hatalı şifre, hesap silme.
- **Katalog:** ISBN önbelleği, Türkçe arama, 3 kullanıcıyla doğrulama, kapak izinleri.
- **Raf tarama:** gruplama, öğrenme döngüsü, kota, bozuk görsel, parçalara bölme ve birleştirme.
- **Senkronizasyon:** son yazan kazanır, silme işaretinin taşınması, başka kullanıcının kaydı, notlar.
- **İstek sınırı.**

### Faz 0 araçları (`scripts/`)

- `npm run faz0:isbn -- isbnler.txt`: Türkçe ISBN'lerin Google Books / Open Library'de bulunma oranı (CSV çıktısı).
- `npm run faz0:scan -- test-seti/`: fotoğraflar + `cevaplar.json` ile tespit oranı, kesinlik (uydurma oranı), süre ve token kullanımı.

**Neden:** Plan, eşikleri ve kotayı "ölçmeden tahmin etme" diyordu; bu araçlar o ölçümü yapar.

---

## 7. Mobil uygulama (`mobile/`)

**Yığın:**
- Expo SDK 57, React Native 0.86, expo-router.
- Yerel veri: expo-sqlite + Drizzle ORM.
- Donanım ve sistem: expo-camera (barkod dahil), expo-notifications (yerel), expo-image, expo-image-manipulator, expo-secure-store.
- Sunucu çağrıları: TanStack Query (yalnızca kota sorgusu).

Kullanılan bütün yerel modüller Expo Go'da hazır gelir; geliştirme için ayrı derleme gerekmez.

### Katmanlar

| Klasör | Görev |
|---|---|
| `src/db/` | Drizzle şeması, migration'lar (`npm run db:generate` ile üretilip `migrations.ts`'e gömülür), değişiklik bildirimi |
| `src/data/` | Bütün yazma/okuma işlemleri: `library`, `locations`, `loans`, `notes`, `scans`, `sync`, `wipe`, `kv` |
| `src/lib/` | API istemcisi, oturum, yaşam döngüsü (senkronizasyon tetikleri), bildirimler, Türkçe biçimlendirme |
| `src/components/` | Ortak bileşenler (`ui.tsx`), alt sayfa, toast, kapak, konum seçici, tarama bileşenleri |
| `src/app/` | Ekranlar (expo-router dosya tabanlı yönlendirme) |
| `src/theme/` | Tasarım token'ları |

### Ekranlar

| Rota | Ekran |
|---|---|
| `(tabs)/index` | Kütüphane: liste/kapak, arama (kitap + alıntılar), filtre çipleri, "Az önce eklendi" |
| `(tabs)/loans` | Ödünçte: gecikenler üstte |
| `(tabs)/profile` | Hesap ve yedek, konumlar, alıntılar, kota, gizlilik, hesap silme |
| `scan/index` | Tara: Raf / Barkod / Elle |
| `scan/review` | Onay listesi |
| `book/[id]` | Kitap detayı: durum, notlar, konum, ödünç, ayrıntılar |
| `book/add` | Elle ekle / bilgileri tamamla |
| `book/notes/[id]` | Bir kitabın tüm alıntı ve notları |
| `notes` | Profil › Alıntılar ve notlar |
| `loans-history` | İade edilenler (aya göre) |
| `locations` | Konum ağacı yönetimi |
| `auth/login`, `auth/register` | Giriş / kayıt |

### Önemli teknik kararlar

- **Ekran yenileme (`useDbQuery`):** Bütün yazmalar veri katmanından geçtiği için her yazma ilgili tabloyu duyurur (`notifyChange`). O tabloyu okuyan sorgular yeniden çalışır. Drizzle'ın `useLiveQuery`'si join'lerdeki ikinci tabloyu izlemediği için kullanılmadı.
- **Senkron SQLite:** Kütüphane yüzlerce/binlerce kayıt; senkron sorgular ilk render'da veriyi hazır verir, yükleniyor ekranı gerekmez.
- **Senkronizasyon tetikleri:**
  - Açılış, uygulama öne gelince, internet geri gelince ve giriş yapılınca.
  - Yerel değişiklikten 4 sn sonra (art arda değişiklikler toplanır).
  - Senkronizasyonun kendi yazmaları ve gönderilemeyen kayıtlar yeni tur başlatmaz (bkz. Bölüm 9'daki döngü hatası).
- **Çevrimdışı ekleme:**
  - Barkod: yalnızca ISBN'li yer tutucu kitap ("Bilgisi bekleniyor"); internet gelince sunucudan bilgisi gelir, kayıt gerçek katalog kitabına taşınır.
  - Elle ekleme: kitap yerelde oluşur, sunucuya **aynı id** ile gider.
  - Raf fotoğrafı: kalıcı klasöre kopyalanıp kuyruğa alınır, işlenince yerel bildirim gelir.
  - Hiçbir kaynakta bulunamayan ISBN 6 saatte bir yeniden sorulur.
- **Raf taraması arka planda:** İşlenirken ekran kapatılabilir; istek sürer, bitince "Raf taraması hazır" bildirimi gelir.
- **Hatırlatmalar:** İade gününün sabahı 10:00'da yerel bildirim. Başka cihazdan gelen açık ödünçlere bu cihazda da kurulur; başka cihazda iade edilenlerinki iptal edilir.
- **"Geri al" her yerde:** Toplu ekleme, barkodla ekleme, konum değişikliği, iade ve not silme.
- **Türkçe dil ayrıntıları:**
  - Bölüm başlıklarında İ/I doğru büyütülür (`turkishUpper`), çünkü CSS/RN `textTransform` "Gizlilik"i "GIZLILIK" yapıyor.
  - Ekler isme göre çekilir: "Ayşe'de / Mert'te", "Ayşe'ye / Mert'e", "6 Kasım'a kadar", "29 Ekim'di" (`format.ts`).
- **Sunucu adresi:** `EXPO_PUBLIC_API_URL` yoksa geliştirmede Expo'yu çalıştıran bilgisayarın IP'si ve 3000 portu. Telefon aynı Wi-Fi'deyse ayar gerekmez.

---

## 8. Tasarım

### Süreç

1. İlk tasarım kullanıcının tarifine göre benim yaptığım sade bir sürümdü.
2. `docs/tasarim-prompt.md`'de bütün ekranları, durumları ve UX hedeflerini anlatan bir brif hazırlandı.
3. Kullanıcı bu brifi başka bir Claude sohbetinde kullanıp **"Kitaplık Ekran Spesifikasyonu"** artifact'ını ürettirdi: 69 ekran, açık/koyu, ölçüler.
4. Figma dosyasına erişim (düzenleme izni) sağlanamadığı için tasarım bu artifact'tan okundu. Her ekran PNG'ye çevrildi, bölüm ölçü notları çıkarıldı.
5. Önce token'lar ve bileşenler, sonra ekranlar uyarlandı. Uygulama tarayıcıda çalıştırılıp ekran görüntüleriyle tasarımla karşılaştırıldı.

### Tasarım dili

- **Kartsız:** İçerik kağıt zemin üzerinde; gruplar ince çizgi ve bölüm başlıklarıyla ayrılır. Gölge yalnızca alt sayfa ve yüzen düğmede.
- **Renkler (açık):**
  - Zemin `#F5F0E6` (kağıt), metin `#2A2520`.
  - Ana eylem `#2F4A3A` (koyu yeşil).
  - Uyarı, gecikme ve "sende" `#7A2E36` (bordo); ödünçte `#8A6116`.
  - Soluk metin `#8E8477`: brifteki `#9A9083` kontrast (AA) eşiğinin altında kaldığı için tasarımda koyulaştırıldı.
- **Koyu tema:** Sistem ayarına uyar. Kamera ekranları her temada koyu (`#0F0E0C`).
- **Yazı:** Başlıklar ve kitap adları serif (Figma'da Lora; uygulamada iOS Georgia, Android sistem serif), gövde sistem fontu.
- **Kapaksız kitaplar:** Başlıktan türetilen 8 sakin sırt renginden biri, solda koyu şerit, sol üstte serif başlık.
- **Sekme menüsü:** Kütüphane | ● Tara ● | Ödünçte | Profil. Tara ortada, menüden taşan 62 pt yeşil daire.

### Tasarımdan bilinçli sapmalar

| Konu | Neden |
|---|---|
| "Sayfayı tara" pasif ("yakında") | Cihazda metin tanıma Expo Go'da yok; kullanıcı ertelemeyi seçti |
| Google ile giriş pasif | İstemci kütüphanesi development build istiyor |
| Kitap detayında sekme menüsü yok | Detay kök yığında açılıyor; sekme içine taşımak gezinmeyi karmaşıklaştırırdı |
| Premium bağlantısı yok | Premium ekranı henüz yok |
| İşlenirken canlı "9 sırt bulundu" sayacı yok | Sunucu sonucu tek seferde döndürüyor; yerine dürüst, zamanla ilerleyen adımlar var |
| Elle eklenen kitabı düzenleme yalnızca sunucuya gitmeden önce | Ortak katalogda güncelleme uç noktası yok |

---

## 9. Karşılaşılan sorunlar ve çözümler

| Sorun | Çözüm |
|---|---|
| `docs.expo.dev` ve `api.expo.dev` bu ortamdan erişilemedi | API'ler kurulu paketlerin tip dosyalarından doğrulandı; `npx expo install` için `EXPO_OFFLINE=1` |
| GitHub push 403 (Claude GitHub App erişimi yoktu) | Commit'ler yerelde tutuldu; kullanıcı erişimi verince push edildi |
| `tsx` ile sunucu açılışında ortak paket bulunamadı | `shared/package.json`'a `"type": "module"` |
| Web önizlemede SQLite açılışta zaman aşımı | Web'de veri tabanı önce eşzamansız açılıp ısıtılıyor (`ensureDb`); telefonda etkisiz |
| expo-sqlite web katmanında 255 bayttan uzun sonuçları bozan hata (uzunluk tek bayta yazılıyor) | Yalnızca önizleme ortamında `node_modules` yamalandı, depoya girmedi; telefonu etkilemiyor |
| Bulunamayan ISBN varken senkronizasyon her 4 sn'de kendini tetikliyordu | Senkronizasyon sürerken gelen değişiklikler yok sayılıyor; yalnızca gönderilebilir değişiklik varsa tur başlıyor; bulunamayan ISBN 6 saatte bir soruluyor |
| Başka cihazda iade edilen kitabın hatırlatması çalmaya devam ediyordu | `ensureReminders` iade edilen/silinen ödüncün bildirimini iptal ediyor |
| Hesap değişiminde iki hesabın kitapları karışıyordu | Farklı hesaba geçişte yerel veri temizleniyor |
| Bildirimden açılan ekranda "geri" çalışmıyordu | `goBack()`: geçmiş yoksa kütüphaneye gider |
| İç içe dokunma alanları (satır içinde düğme) erişilebilirliği bozuyordu | Satır ve eylem kardeş öğelere ayrıldı |
| Figma dosyası okunamadı (düzenleme izni yok) | Tasarım, aynı içeriği taşıyan artifact'tan okundu |

---

## 10. Doğrulama

- **Otomatik testler:** `npm test` → 12 ortak + 27 sunucu testi geçiyor.
- **Statik kontroller:** `npm run typecheck`, `cd mobile && npx expo lint` temiz.
- **Derleme:** `npx expo export --platform android` başarılı.
- **Uçtan uca:** Uygulama tarayıcıda (390×844) Playwright ile çalıştırıldı. Kayıt, elle ekleme, raf tarama (sahte kamera + sahte model), onay listesi, ödünç, notlar, konumlar, arama, barkod ve koyu tema yürütüldü. Çevrimdışı akış da denendi: barkod → yer tutucu, raf → kuyruk, internet gelince doldu.
- **Veri tabanı kontrolü:** Senkronlanan verinin sunucuya ulaştığı veri tabanından doğrulandı.

**Doğrulanamayanlar:**
- Gerçek telefonda çalıştırma (bu ortamda cihaz yok).
- Gerçek OpenAI taraması (anahtar yok).
- Docker imajı derlemesi (Docker daemon yok; adımlar ayrıca elle denendi).

---

## 11. Sıradaki işler

1. **Telefonda deneme:** Expo Go (SDK 57) ile; README'deki "Hızlı başlangıç".
2. **Faz 0:** Gerçek raf fotoğrafları ve 50 Türkçe ISBN ile ölçüm. Sonra `MATCH_THRESHOLDS` ve tarama kotası güncellenir.
3. **OpenAI anahtarı:** `server/.env` → `VISION_PROVIDER=openai`.
4. **Sunucuyu yayına alma:** `docker compose up -d`. Ardından `mobile/eas.json` içindeki adres güncellenip EAS ile derleme yapılır.
5. **Sonraki sürüm:** "Sayfayı tara" (cihazda OCR, development build), Google ile giriş, Premium, istatistik kartları, CSV/Goodreads içe aktarma, ortak katalogda kitap bilgisi düzeltme.
6. **Play Store:** Kişisel hesaplar için 12 test kullanıcısıyla 14 günlük kapalı test şartı (planın Faz 4'ü).

---

## 12. Yeni bir oturumda devam etmek için

1. Dalı al: `git checkout claude/server-code-writing-62wh6u`.
2. PostgreSQL'i başlat, sunucuyu çalıştır: `npm install`, `npm run dev --workspace server`.
3. Mobil: `cd mobile && npm install && npx expo start`.
4. Değişiklikten sonra: `npm test`, `npm run typecheck`, `cd mobile && npx expo lint`, `npm run format`.
5. Mobil şema değişirse: `cd mobile && npm run db:generate`. Sunucu şeması için `server/migrations/` altına yeni numaralı `.sql` eklenir; açılışta otomatik uygulanır.
6. Senkronlanan yeni bir tablo eklenirken dokunulacak yerler:
   - `shared/src/types.ts` (`SyncChanges`)
   - `server/src/sync/routes.ts` (push şeması + upsert + pull)
   - `mobile/src/db/schema.ts` (+ `outbox` enum)
   - `mobile/src/data/sync.ts` (push/pull)
   - `mobile/src/data/wipe.ts`
   - `mobile/src/lib/lifecycle.ts` (tetik tabloları)
