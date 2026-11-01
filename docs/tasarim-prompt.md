# Kitaplık — Tasarım Brifi (tasarım agent'ı için prompt)

Sen kıdemli bir mobil ürün tasarımcısısın. Aşağıda anlatılan **Kitaplık** uygulamasının tüm ekranlarını, kullanıcı deneyimini (UX) merkeze alarak yüksek çözünürlüklü (high-fidelity) olarak tasarla. Uygulama Türkçe, iOS ve Android'de çalışan bir React Native (Expo) uygulaması. Kod zaten yazılı ve çalışıyor; senden beklenen, bu ekranları ve akışları daha net, daha sakin ve daha kolay kullanılır hale getiren bir tasarım. Ekranların **işlevini ve içeriğini değiştirme**; düzeni, hiyerarşiyi, mikro metinleri, durumları ve etkileşimleri iyileştir. İşlevsel bir öneri yapacaksan ayrıca "öneri" diye işaretle.

---

## 1. Ürün özeti

Kitaplık, evdeki fiziksel kitap koleksiyonunu dijitalleştiren ve **internet olmadan da çalışan** bir koleksiyon yöneticisi. Sosyal okuma ağı değil (Goodreads, 1000Kitap ile yarışmıyor).

Rakiplerden ayrıldığı üç nokta:
1. **Raf tarama:** Kitapları tek tek değil, rafın fotoğrafını çekip toplu ekleme. Uygulamanın "vay" anı.
2. **Türkçe kitaplarda doğru eşleşme:** Global kitap servislerinin zayıf kaldığı Türkçe baskılarda kendi kataloğu ve kullanıcı düzeltmeleri.
3. **Fiziksel dünyaya bağlılık:** Kitabın hangi rafta durduğu, kime ödünç verildiği ve kitapçıdayken "bu bende var mı?" kontrolü.

### Hedef kullanıcı
Evinde yüzlerce kitap biriktirmiş, ne olduğunu artık takip edemeyen, aynı kitabı iki kez alan okur. İkincil: kitap ödünç veren ve kime ne verdiğini unutan kişi.

### Dört ana senaryo (tasarım bunlara göre optimize edilmeli)
1. **İlk kurulum:** Kullanıcı salondaki kitaplığın her rafını çekiyor, 15 dakikada 200 kitabı içeri alıyor. → Raf tarama + onay listesi akışı hızlı ve yorulmadan tekrarlanabilir olmalı.
2. **Kitapçıda:** Barkodu okutuyor, uygulama internet olmasa bile "Bu kitap sende, Salon / 2. raf" diyor. → Barkod sonucu tek bakışta anlaşılmalı, tek elle kullanılabilmeli.
3. **Ödünç:** Kitabı arkadaşına verirken iki dokunuşla kaydediyor, iade gününde hatırlatma alıyor.
4. **Bulma:** "Dostoyevski hangi raftaydı?" diye arıyor, konumu görüyor.

---

## 2. Tasarım dili (mevcut, korunmalı)

Kullanıcının isteği: **"Yoğun kart kullanımı olmadan, gözü yormayan; kağıt tonları üzerinde koyu yeşil ve bordo vurgu. UX ön planda."**

- **Kartsız düzen:** İçerik doğrudan zemin üzerinde; gruplar ince (hairline) ayırıcılar ve bölüm başlıklarıyla ayrılır. Gölge, kutu, kart yığını yok. Alt sayfalar (bottom sheet) ve kamera üstü paneller tek istisna.
- **Tipografi:** Başlıklar ve kitap adları **serif** (Georgia benzeri), gövde metni sistem sans-serif. Bölüm başlıkları küçük, harf aralıklı, büyük harf. **Türkçe büyük harf kuralına dikkat:** "Gizlilik" → "GİZLİLİK" (I değil İ).
- **Renkler (açık tema):**
  | Token | Değer | Kullanım |
  |---|---|---|
  | bg | #F5F0E6 | Kağıt zemin |
  | bgSunken | #EDE6D8 | Arama kutusu, segment kontrol zemini, basılı satır |
  | surface | #FAF7F0 | Metin giriş alanı |
  | text | #2A2520 | Ana metin |
  | textMuted | #6F665A | İkincil metin |
  | textFaint | #9A9083 | Üçüncül metin, ipuçları |
  | hairline | #DDD3C1 | Ayırıcı çizgiler |
  | primary | #2F4A3A | Koyu yeşil: ana eylem, seçili durum |
  | accent | #7A2E36 | Bordo: geciken iade, silme, "Bu kitap sende" |
  | warning | #8A6116 | Ödünçteki kitap, kontrol bekleyen |
- **Koyu tema** zorunlu (sistem ayarına uyar): zemin #1A1815, metin #ECE5D8, primary #9DBFA8, accent #D9959B.
- **Kapaksız kitaplar:** Başlıktan türetilen 8 sakin "sırt rengi"nden biriyle dolu, üzerinde başlık yazan yer tutucu. Liste kapaksız kitaplarda da düzenli görünmeli.
- **Dokunma hedefleri** en az 44 pt. Tek elle kullanım: ana eylemler ekranın alt yarısında.
- **Kamera ekranları** koyu (#0F0E0C) zemin, açık kağıt rengi metin ve düğmeler.

---

## 3. Navigasyon yapısı

Alt menüde dört öğe:

`[Kütüphane]  [● Tara ●]  [Ödünçte]  [Profil]`

- **Tara** bir sekme değil, büyük yeşil hap şeklinde ana eylem düğmesi; dokununca tam ekran tarama ekranını aşağıdan açar.
- **Ödünçte** sekmesinde iadesi geciken kitap varsa simgenin köşesinde bordo nokta.
- Diğer ekranlar yığın (stack) olarak açılır: Kitap detayı, Onay listesi, Konumlar. Elle ekle, Giriş ve Hesap oluştur modal olarak açılır.
- **Tasarım sorusu:** Tara düğmesi dört öğeli menüde ikinci sırada, yani tam ortada değil. Simetrik ve başparmakla kolay ulaşılan bir çözüm öner (ör. ortada yükseltilmiş düğme ve iki yanda ikişer öğe), ama menüde yalnızca bu üç sekme ve Tara olsun.

---

## 4. Ekranlar

Her ekran için **tüm durumları** tasarla: boş, yükleniyor, dolu, hata, çevrimdışı, hesapsız.

### 4.1 Kütüphane (ana sekme)
**Amaç:** Koleksiyona göz atmak ve kitap bulmak. Tamamen internetsiz çalışır.

İçerik (yukarıdan aşağıya):
- Büyük serif başlık "Kütüphane", altında "128 kitap". Sağda liste ↔ kapak ızgarası görünüm düğmesi.
- **Arama kutusu:** "Başlık, yazar ya da ISBN". Türkçe karakter duyarsız arar ("suc ve ceza" ile "Suç ve Ceza" bulunur).
- **Yatay kaydırılan filtre çipleri:**
  - Konum (konum seçiciyi açar; seçilince "Salon / 2. raf" yazar ve alt konumları da kapsar)
  - Sıralama (Son eklenen / Başlık / Yazar soyadı)
  - Durum çipleri sayılarıyla: Okunuyor 3, Okunacak 40, Okundu 80, Yarıda bırakıldı 5
- **Bekleyen tarama bandı** (yalnızca varsa): "2 raf taraması onay bekliyor · Bulunan kitapları kontrol edip ekle ›" ya da "Raf fotoğrafı kuyrukta · İnternet gelince işlenecek".
- **Liste görünümü** satırı: küçük kapak (48 pt), serif başlık (en çok 2 satır), yazar. Üçüncü satırda konum ("Salon / 2. raf" ya da "Konumsuz"); kitap ödünçteyse onun yerine sarı/bordo "Ayşe'de · 3 gün gecikti". Durum "Okunacak" değilse yanında "· Okunuyor" gibi küçük etiket.
- **Kapak ızgarası:** 3+ sütun kapak, altında başlık ve ilk yazar.
- **Çevrimdışı barkodla eklenmiş kitap:** gri kapak, başlık yerine "Bilgisi bekleniyor", altında "ISBN 978…".

Durumlar:
- **Hiç kitap yok (ilk açılış):** Simge, "Kitaplığını içeri al" başlığı, kısa açıklama; "Rafı tara" (birincil) ve "Barkod okut" (ikincil). Bu ekran ilk izlenimdir; raf taramanın değerini anlatmalı.
- **Arama/filtre sonucu boş:** "Eşleşen kitap yok" ve "Filtreleri temizle".

UX hedefleri: 500+ kitapta hızlı tarama, aktif filtrelerin açıkça görünmesi ve tek dokunuşla kaldırılabilmesi, arama kutusunun her zaman erişilebilir olması.

### 4.2 Tara (tam ekran, kamera)
Üstte sol köşede kapat (✕), altta üç modlu segment kontrol: **Raf | Barkod | Elle**. "Elle" seçilince Elle ekle formuna geçer. Son kullanılan mod hatırlanır.

**Kamera izni yoksa:** Koyu ekranda kamera simgesi, "Kamera izni gerekiyor", gizlilik açıklaması ("Fotoğraflar yalnızca kitapları tanımak için işlenir, saklanmaz"), "İzin ver" (kalıcı reddedildiyse "Ayarları aç") ve "Elle ekle".

#### 4.2.a Raf modu
Akış: ipucu → çek → önizle → işleniyor → onay listesi.
1. **Kamera:** Üstte ipucu bandı ("Tek raf · telefonu dik ve rafa paralel tut · iyi ışık"), ortada raf çerçeve kılavuzu. Altta büyük deklanşör, solunda galeriden seç.
2. **Önizleme:** Çekilen fotoğraf tam ekran. "Sırtlar okunaklı mı? Bulanıksa yeniden çek." metni, "Yeniden çek" (ikincil) ve "Kitapları bul" (birincil, açık renk).
3. **İşleniyor (10–20 sn):** Fotoğrafın üstünde karartma ve zamanla değişen aşama metni: "Fotoğraf yükleniyor… → Sırtlar okunuyor… → Kitaplar eşleştiriliyor… → Neredeyse bitti…". Altında "Genellikle 10–20 saniye sürer." Bekleme hissini azaltacak, dürüst bir ilerleme görselleştirmesi tasarla; sahte yüzde gösterme.
4. **Hata durumları:**
   - **Aylık tarama hakkı doldu:** Bordo bilgi bandı: "Bu ayki raf tarama hakkın doldu. Barkod ve elle ekleme sınırsız." Premium'a geçişe bağlanabilir.
   - **İnternet yok:** Fotoğraf kuyruğa alınır, ekran kapanır ve alt bildirim çıkar: "İnternet yok gibi görünüyor. Fotoğraf kuyruğa alındı, hazır olunca haber vereceğiz."
   - **Hesap yok:** Birincil düğme "Giriş yap ve tara" olur ve giriş ekranına götürür. Giriş ekranında "Raf tarama sunucuda yapıldığı için hesap gerekiyor" açıklaması.

#### 4.2.b Barkod modu
- Üstte ortada hap şeklinde **konum seçici**: "📍 Salon / 2. raf" ya da "Konum seç". Eklenen kitaplar bu konuma gider ve seçim hatırlanır.
- Ortada barkod çerçevesi ve "Kitabın arkasındaki barkodu çerçeveye getir".
- Altta kağıt renkli panel. Boştayken:
  - "Art arda okut" anahtarı (açıkken okunan her kitap kartı kapatmadan hemen eklenir; altında "12 kitap eklendi" sayacı)
  - "Barkod okunmuyor mu? ISBN'i yaz" bağlantısı (rakam klavyeli giriş alanı ve "Ara")
- Okutunca panel **sonuç kartına** dönüşür. Kart türleri:
  - **Aranıyor:** "ISBN 978… aranıyor…"
  - **Bu kitap sende** (internetsiz çalışır; en önemli kart): bordo "BU KİTAP SENDE" etiketi, kapak, başlık, konum ya da "Şu an Ayşe'de". Altında "Kitaba git". Kitapçıda bir bakışta okunmalı; titreşimle desteklenir.
  - **Bulundu:** kapak, başlık, yazar, "Kütüphaneye ekle". Eklenince "EKLENDİ · Salon / 2. raf" ve "Sıradaki kitap".
  - **İnternet yok:** "İnternet yok. Kitap şimdilik ISBN ile eklenir; internet gelince kapak ve bilgiler dolar." ve "Yine de ekle".
  - **Hiçbir kaynakta yok:** "Bu ISBN hiçbir kaynakta yok. Bilgileri bir kez gir; senden sonra okutan herkes için hazır olur." ve "Elle ekle".
  - **Kitap barkodu değil:** "Kitap barkodları 978 ya da 979 ile başlar."

### 4.3 Onay listesi (raf taraması sonrası)
**Amaç:** Modelin bulduğu kitapları hızlıca kontrol edip toplu eklemek. **Hiçbir kitap kullanıcı onayı olmadan eklenmez.**

- Özet: "12 kitap bulundu", altında "9 eşleşti · 2 kontrol bekliyor · 1 bulunamadı". Varsa "2 sırt okunamadı; onları barkodla ekleyebilirsin."
- **"Hepsinin konumu"** satırı: tek seferde tüm kitaplara konum atar.
- Üç grup, bu sırayla:
  1. **Kontrol et:** Model okudu ama iki aday arasında emin değil. Varsayılan olarak seçili değil, kullanıcı "Seç" ile aday belirler.
  2. **Eşleşti:** Varsayılan olarak seçili gelir, dokununca seçim kalkar.
  3. **Bulunamadı:** Okunan metin gösterilir; "Seç" ile arama yapılabilir ya da atlanır.
- **Satır yapısı:** Solda onay işareti (seçili / boş / soru işareti), küçük kapak, başlık, yazar · yayınevi. Altta soluk metinle **"Sırtta: DOSTOYEVSKI SUC VE CEZA"**; modelin gerçekte ne okuduğu her zaman görünür, bu güveni artırır. Kitap zaten kütüphanedeyse bordo "Zaten kütüphanende" ve varsayılan olarak seçili değil. Sağda "Değiştir" / "Seç".
- **Aday seçim alt sayfası ("Hangi kitap?"):** Sırtta okunan metin, puan sırasıyla adaylar (kapak, başlık, yazar · yayınevi · yıl; seçili olanda ✓). Altında "Aradığın yoksa ara" arama alanı, sonuç listesi ve en altta "Hiçbiri, bu kitabı atla".
- **Sabit alt düğme:** "9 kitabı kütüphaneye ekle". Hiç seçim yoksa pasif "Eklenecek kitap seç".
- En altta küçük, tehlikeli eylem: "Bu taramayı sil".
- Ekleme sonrası kütüphaneye dönülür ve alt bildirim çıkar: "9 kitap eklendi · 2 tanesi zaten vardı".

UX hedefi: 15–30 kitaplık bir rafı 30 saniyede onaylamak. Dikkat gerektirenler (Kontrol et) üstte, rutin olanlar (Eşleşti) toplu. Kontrol bekleyen satırlar için yeni bir etkileşim önerebilirsin; örneğin adayları satırın içinde açmak.

### 4.4 Kitap detayı
- **Üst:** Büyük kapak (112 pt), serif başlık, yazar(lar), "İletişim Yayınları · 2015 · 687 sayfa". Elle eklenmiş ve doğrulanmamışsa küçük "Elle eklendi".
- **Bilgisi bekleyen kitapta** bilgi kutusu: "İnternet gelince kapak ve bilgiler kendiliğinden dolacak. Kitap hiçbir kaynakta bulunamazsa bilgileri sen girebilirsin." ve "Bilgileri elle gir".
- **Okuma durumu:** 4'lü segment kontrol: Okunacak | Okunuyor | Okundu | Yarıda.
- **NEREDE** bölümü:
  - Konum satırı: değer "Salon / 2. raf" ya da "Seç", dokununca konum seçici açılır.
  - Ödünç satırı:
    - Ödünçte değilse: "Ödünç ver ›".
    - Ödünçteyse: "Ayşe'de · 6 Kasım · 14 gün kaldı" ve sağda "Geri geldi" düğmesi. Gecikmişse bordo "İade tarihi geçti."
- **AYRINTILAR** bölümü: kapak yoksa "Kapak fotoğrafı ekle", ISBN, Eklendi (tarih ve "Barkodla / Raf taramasıyla / Elle").
- En altta bordo "Kütüphaneden çıkar" (onay penceresiyle).
- Değişikliklerden sonra kısa alt bildirim: "Konum: Salon / 2. raf", "İade kaydedildi".

### 4.5 Ödünç ver (alt sayfa)
"İki dokunuşta ödünç" hedefi.
- Kitap adı (alıntı içinde)
- "Kime?" ad alanı
- Daha önce ödünç verilen kişiler hızlı seçim çipleri olarak (en sık olan başta)
- "İade" seçenekleri çip olarak: 1 hafta | **2 hafta** (varsayılan) | 1 ay | 2 ay | Tarihsiz
- Altında açıklama: "6 Kasım 2026 sabahı hatırlatacağız." (Tarihsiz seçilince "Hatırlatma kurulmayacak.")
- Sabit "Kaydet" düğmesi
- Gizlilik: Kişi rehberden alınmaz, yalnızca ad saklanır.

### 4.6 Elle ekle (modal)
Kaynaklarda bulunmayan Türkçe kitaplar için zorunlu; bu yüzden **hızlı ve az zorunlu alanlı** olmalı. Yalnızca başlık zorunlu.
- Kapak alanı (yer tutucu kapak ve yanında "Kapağın fotoğrafını çekersen kitabı listede kolay tanırsın", "Çek" ve "Galeri")
- Başlık (zorunlu), Yazar (virgülle birden fazla), Yayınevi, Yıl | Sayfa (yan yana), ISBN ("Arka kapakta, barkodun üstünde")
- ISBN girilince "ISBN'den bilgileri getir" bağlantısı; sonuç ipucu satırında gösterilir.
- Okuma durumu segmenti, Konum satırı, "Kütüphaneye ekle".
- Hata mesajları alanın altında bordo: "Başlık gerekli", "Geçerli bir ISBN değil".
- **Tamamlama modu** (bilgisi bekleyen kitap için): ISBN kilitli, durum ve konum gizli, düğme "Bilgileri kaydet".

### 4.7 Ödünçte (sekme)
- Başlık "Ödünçte", altında "3 kitap başkasında" ya da "Tüm kitapların evde".
- **İADESİ GECİKENLER** (bordo bölüm başlığı) en üstte, ardından **ÖDÜNÇTE**.
- Satır: kapak, **kişi adı** (en belirgin), kitap adı, "6 Kasım · 14 gün kaldı" ya da bordo "3 gün gecikti" ya da "12 Ekim tarihinden beri". Sağda "Geri geldi".
- "İade edilenleri göster": geçmiş listesi (kitap, kişi, iade tarihi).
- Boş durum: "Ödünçte kitap yok. Bir kitabı ödünç verirken kitabın sayfasından 'Ödünç ver'e dokun; iade günü sana hatırlatalım."

### 4.8 Profil (sekme)
- Başlık "Profil", altında "128 kitap · 80 okundu · 3 okunuyor".
- **HESAP VE YEDEK**:
  - **Girişliyken:** Ad ve e-posta. "Bulut yedeği" satırı; alt metin durumu gösterir: "Son eşitleme 5 dk önce · 2 değişiklik bekliyor" / "Eşitleniyor…" / "İnternet yok; değişiklikler bekliyor" / "Eşitlenemedi: …". Sağda "Eşitle". Altında "Çıkış yap" (onay: "Kitapların bu cihazda kalır…").
  - **Hesapsızken:** "Kütüphanen şu an yalnızca bu telefonda. Hesap açarsan kitapların yedeklenir, telefon değişince kaybolmaz. Raf tarama için de hesap gerekiyor." ve "Hesap oluştur" | "Giriş yap". Bu, hesap açmaya ikna eden ana yer; değeri iyi anlatmalı.
- **KÜTÜPHANE**:
  - Konumlar ("Oda, raf ve kutular", sayı)
  - Raf tarama hakkı ("Bu ay 3/20 kullanıldı · 1 Aralık yenilenir")
  - Barkod ve elle ekleme ("Sınırsız")
- **GİZLİLİK**: "Raf fotoğrafların saklanmaz. Fotoğraf yalnızca kitapları tanımak için işlenir ve hemen silinir. Ödünç verdiğin kişilerin yalnızca adı tutulur."
- Bordo "Hesabı sil" (mağaza kuralı gereği; güçlü onay penceresi).
- En altta soluk sürüm bilgisi.

### 4.9 Konumlar
- Açıklama: "Kitapların nerede durduğunu kaydet: önce odalar, sonra içine raflar ve kutular."
- İç içe ağaç: girintili satırlar (alt konumlarda ↳ işareti), sağda "12 kitap" sayısı ve "+" ile içine konum ekleme.
- Satıra dokununca alt sayfa açılır: ad düzenleme, "Kaydet", "Sil" (onay: "İçindeki alt konumlar da silinir. Kitaplar kütüphanende kalır, yalnızca konumsuz olur.").
- Altta "Oda ya da alan ekle".
- Boş durum: "Henüz konum yok. Örneğin 'Salon', içinde '2. raf'."

### 4.10 Konum seçici (ortak alt sayfa)
Kütüphane filtresi, kitap detayı, barkod modu, onay listesi ve elle eklemede kullanılır.
- "Konumsuz" seçeneği, girintili ağaç (seçili olanda ✓, her satırda "+" ile içine ekleme).
- En altta "Yeni konum" satırı: tıklanınca satır içinde ad alanı ("“Salon” içine" etiketiyle), "Vazgeç" | "Ekle ve seç".
- Seçince sayfa kapanır. Başlık bağlama göre değişir: "Konum seç", "Konuma göre süz", "Bu raftaki kitapların konumu".

### 4.11 Giriş yap / Hesap oluştur (modal)
- Bağlama göre açıklama (raf taramasından gelindiyse neden hesap gerektiği).
- Kayıtta "Şu ana kadar eklediğin kitaplar da hesaba aktarılır" güvencesi.
- Alanlar: Adın (isteğe bağlı, yalnızca kayıtta), E-posta, Şifre ("En az 8 karakter").
- Hata satırı (bordo), birincil düğme, ekranlar arası geçiş bağlantısı.
- Google ile giriş ileride eklenecek; düğmesi için yer ayırabilirsin.

### 4.12 Sistem geri bildirimleri
- **Alt bildirim (toast):** Koyu zeminli, tek satır mesaj ve isteğe bağlı tek eylem ("Geri al"). Sekme menüsünün üstünde çıkar.
- **Onay pencereleri:** Silme, çıkış ve hesap silme için.
- **Yerel bildirimler** (bildirime dokununca ilgili ekran açılır):
  - "İade günü: Ayşe, 'Suç ve Ceza' kitabını bugün geri getirecekti." → kitap detayı
  - "Raf taraması hazır: 12 kitap bulundu. Onaylamak için dokun." → onay listesi

---

## 5. Davranış kuralları (tasarımı etkiler)

- **Yerel öncelikli:** Göz atma, arama, "bende var mı?" ve tüm düzenlemeler internetsiz anında çalışır. Senkronizasyon arka planda olur. **Çevrimdışılığı hata gibi değil, normal bir durum gibi göster.**
- **Hesap isteğe bağlı:** Uygulama hesapsız tam çalışır; yalnızca raf tarama ve yedek hesap ister.
- **Raf tarama kotası:** Ücretsiz planda aylık sınırlı (ör. 20), barkod ve elle ekleme sınırsız.
- **Çevrimdışı ekleme:** Barkodla eklenen kitap "bilgisi bekleniyor" olarak girer, internet gelince kendiliğinden dolar. Raf fotoğrafı kuyruğa girer, işlenince bildirim gelir.
- Model bazen kitap uydurabilir; bu yüzden onay listesinde **"Sırtta: …" ham metni her zaman görünür.**

## 6. Erişilebilirlik ve yerelleştirme
- Tüm metinler Türkçe; uzun Türkçe kelimelere ve uzun kitap adlarına göre esnek düzen. Örnek: "Saatleri Ayarlama Enstitüsü", "Fyodor Mihayloviç Dostoyevski".
- WCAG AA kontrast; özellikle kağıt zemindeki soluk metinler ve kamera üstündeki metinler.
- Dinamik yazı boyutuna (büyük metin) dayanıklı düzen.
- Ekran okuyucu için her simge düğmesinin etiketi. İç içe dokunma alanı yok: satırın içindeki ikincil eylem ("Geri geldi", "Değiştir") satır dokunmasından ayrı tutulur.
- Renk tek başına anlam taşımasın: geciken iade hem bordo hem metinle belirtilir.

## 7. Kapsam dışı (tasarlama)
YZ ile kitap özeti, sosyal akış ve takipleşme, e-kitap okuyucu. Sonraki sürüm (v1.1) için yalnızca yer bırakılabilir: sayfadan alıntı ve notlar, aylık istatistik kartları, CSV/Goodreads içe aktarma.

## 8. Teslim beklentisi
1. **Tasarım sistemi:** Renk ve tipografi token'ları (açık ve koyu), boşluk ölçeği, bileşenler. Bileşenler: düğme türleri (birincil, ikincil, metin, tehlikeli, koyu zemin), liste satırı, bölüm başlığı, çip, segment kontrol, metin alanı, alt sayfa, toast, kitap kapağı ve yer tutucusu, boş durum.
2. Yukarıdaki **her ekranın tüm durumlarıyla** tasarımı (iPhone boyutu 390×844; açık ve koyu).
3. Dört ana senaryonun **akış şemaları** (ilk kurulum, kitapçıda barkod, ödünç, bulma).
4. Önerdiğin UX iyileştirmelerinin kısa gerekçeli listesi: neyi neden değiştirdin. Özellikle sekme menüsündeki Tara yerleşimi, raf işleme bekleme ekranı, onay listesinde kontrol bekleyen satırlar ve hesapsız kullanıcıyı hesaba ikna eden yer.
5. Uygulanabilirlik: React Native ile yapılabilir olmalı. Sistem fontları, Ionicons simge seti, standart hareketler (alt sayfa kayması, kısa solma). Ağır özel animasyon ya da bulanıklık efektine dayanma.
