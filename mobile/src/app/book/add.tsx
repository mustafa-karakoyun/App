import { toIsbn13, type Book, type ReadingStatus } from '@kitaplik/shared';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BookCover } from '@/components/BookCover';
import { LocationPicker } from '@/components/LocationPicker';
import { useToast } from '@/components/Toast';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, LinkButton, Notice, Row, SectionLabel, Segmented, TextField } from '@/components/ui';
import { getKv } from '@/data/kv';
import { addCatalogBook, addManualBook, completePendingBook, findOwnedByIsbn, getBookRow } from '@/data/library';
import { locationPaths } from '@/data/locations';
import { preparePhoto } from '@/data/scans';
import { api, ApiError, isOffline } from '@/lib/api';
import { radius, space, useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { goBack } from '@/lib/nav';

const STATUS_OPTIONS: { value: ReadingStatus; label: string }[] = [
  { value: 'to_read', label: 'Okunacak' },
  { value: 'reading', label: 'Okunuyor' },
  { value: 'read', label: 'Okundu' },
  { value: 'abandoned', label: 'Yarıda' },
];

/**
 * Elle ekleme. API'de bulunamayan Türkçe kitaplar için zorunlu; bu yüzden az alanla
 * hızlı: yalnızca başlık zorunlu. `complete` parametresiyle çevrimdışı eklenmiş
 * yer tutucu kitabın bilgilerini tamamlar.
 */
export default function AddBookScreen() {
  const params = useLocalSearchParams<{ isbn?: string; complete?: string; title?: string; author?: string }>();
  const { c } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const completing = params.complete ?? null;
  // Tamamlama/düzenlemede mevcut bilgiler (yer tutucu başlık hariç) forma gelir.
  const [existing] = useState(() => (completing ? getBookRow(completing) : null));
  const known = existing && existing.syncState !== 'pending_isbn' ? existing : null;

  const [title, setTitle] = useState(params.title ?? known?.title ?? '');
  const [authors, setAuthors] = useState(
    params.author ?? (known ? (JSON.parse(known.authors) as string[]).join(', ') : ''),
  );
  const [publisher, setPublisher] = useState(known?.publisher ?? '');
  const [year, setYear] = useState(known?.year ? String(known.year) : '');
  const [pages, setPages] = useState(known?.pageCount ? String(known.pageCount) : '');
  const [isbn, setIsbn] = useState(params.isbn ?? '');
  const [cover, setCover] = useState<string | null>(null);
  const [status, setStatus] = useState<ReadingStatus>('to_read');
  const [locationId, setLocationId] = useState<string | null>(() => getKv('scan.location'));
  const [picker, setPicker] = useState(false);
  const [lookup, setLookup] = useState<{ loading: boolean; message: string | null }>({ loading: false, message: null });
  const [errors, setErrors] = useState<{ title?: string; isbn?: string; year?: string }>({});

  const locationPath = locationId ? (locationPaths().get(locationId) ?? null) : null;

  const pickCover = async (camera: boolean) => {
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return pickCover(false);
    }
    const res = camera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [2, 3], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [2, 3],
          quality: 0.8,
        });
    const asset = res.canceled ? null : res.assets[0];
    if (asset) setCover(await preparePhoto(asset.uri, asset.width, asset.height));
  };

  /** ISBN girildiyse bir kez daha kaynaklara sor: belki bulunur ve form gereksiz kalır. */
  const fetchByIsbn = async () => {
    const normalized = toIsbn13(isbn);
    if (!normalized) {
      setErrors((e) => ({ ...e, isbn: 'Geçerli bir ISBN değil' }));
      return;
    }
    setLookup({ loading: true, message: null });
    try {
      const book = await api<Book>(`/books/isbn/${normalized}`);
      setTitle(book.title);
      setAuthors(book.authors.join(', '));
      setPublisher(book.publisher ?? '');
      setYear(book.year ? String(book.year) : '');
      setPages(book.page_count ? String(book.page_count) : '');
      setLookup({
        loading: false,
        message: `Bulundu: ${['başlık', book.authors.length ? 'yazar' : null, book.year ? 'yıl' : null]
          .filter(Boolean)
          .join(', ')
          .replace(/, ([^,]*)$/, ' ve $1')} dolduruldu`,
      });
    } catch (err) {
      setLookup({
        loading: false,
        message: isOffline(err)
          ? 'İnternet yok; bilgileri elle girebilirsin.'
          : err instanceof ApiError && err.status === 404
            ? 'Bu ISBN kaynaklarda yok; bilgileri sen gir.'
            : 'Şu an aranamadı.',
      });
    }
  };

  const save = async () => {
    const next: typeof errors = {};
    if (!title.trim()) next.title = 'Başlık gerekli';
    const normalizedIsbn = isbn.trim() ? toIsbn13(isbn) : null;
    if (isbn.trim() && !normalizedIsbn) next.isbn = 'Geçerli bir ISBN değil (boş bırakabilirsin)';
    const yearNum = year.trim() ? Number(year) : null;
    if (yearNum !== null && (!Number.isInteger(yearNum) || yearNum < 1400 || yearNum > new Date().getFullYear() + 1)) {
      next.year = 'Geçerli bir yıl gir';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    if (normalizedIsbn && !completing) {
      const owned = findOwnedByIsbn(normalizedIsbn);
      if (owned) {
        toast('Bu kitap zaten kütüphanende');
        router.replace(`/book/${owned.userBook.id}`);
        return;
      }
    }

    const input = {
      isbn13: normalizedIsbn,
      title: title.trim(),
      authors: authors
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      publisher: publisher.trim() || null,
      year: yearNum,
      page_count: pages.trim() ? Number(pages) || null : null,
    };

    if (completing) {
      completePendingBook(completing, input, cover);
      toast('Bilgiler kaydedildi');
      goBack();
      return;
    }

    // Formu doldururken ISBN kaynaklarda bulunduysa katalog kaydını kullan.
    if (normalizedIsbn && lookup.message?.startsWith('Bulundu')) {
      try {
        const book = await api<Book>(`/books/isbn/${normalizedIsbn}`);
        const { userBook } = addCatalogBook(book, { addedVia: 'manual', status, locationId });
        toast('Kütüphaneye eklendi');
        router.replace(`/book/${userBook.id}`);
        return;
      } catch {
        // Bağlantı koptuysa elle kayıtla devam.
      }
    }

    const { userBook } = addManualBook(input, { addedVia: 'manual', status, locationId, localCoverUri: cover });
    toast('Kütüphaneye eklendi');
    router.replace(`/book/${userBook.id}`);
  };

  const found = lookup.message?.startsWith('Bulundu');
  const isbnHint = completing
    ? 'Barkoddan geldi, değiştirilemez'
    : found
      ? null
      : (lookup.message ?? 'Arka kapakta, barkodun üstünde');

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: completing ? (known ? 'Bilgileri düzenle' : 'Bilgileri tamamla') : 'Elle ekle',
          headerLeft: () => <LinkButton title="Vazgeç" color={c.text} onPress={goBack} />,
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {found ? (
          <Notice icon="checkmark" tone="primary" style={{ borderRadius: 0 }}>
            <AppText variant="small" style={{ fontWeight: '600' }}>
              {lookup.message}
            </AppText>
          </Notice>
        ) : null}
        <View style={styles.coverRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kapak fotoğrafı çek"
            onPress={() => pickCover(true)}
          >
            <BookCover
              uri={cover ?? existing?.localCoverUri ?? existing?.coverUrl}
              title={title}
              width={72}
              pending={!cover && !title}
            />
          </Pressable>
          <View style={{ flex: 1, gap: space.md }}>
            <AppText variant="small" muted>
              Kapağın fotoğrafını çekersen kitabı listede kolay tanırsın.
            </AppText>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button
                title="Çek"
                icon="camera-outline"
                kind="secondary"
                compact
                onPress={() => pickCover(true)}
                style={styles.smallButton}
              />
              <Button
                title="Galeri"
                icon="image-outline"
                kind="secondary"
                compact
                onPress={() => pickCover(false)}
                style={styles.smallButton}
              />
            </View>
          </View>
        </View>

        <View style={styles.form}>
          <TextField
            label="Başlık *"
            value={title}
            onChangeText={setTitle}
            autoFocus={!params.isbn && !completing}
            error={errors.title}
            returnKeyType="next"
          />
          <TextField
            label="Yazar"
            value={authors}
            onChangeText={setAuthors}
            placeholder="Virgülle birden fazla yazar"
            autoCapitalize="words"
          />
          <TextField label="Yayınevi" value={publisher} onChangeText={setPublisher} />
          <View style={{ flexDirection: 'row', gap: space.lg }}>
            <View style={{ flex: 1 }}>
              <TextField
                label="Yıl"
                value={year}
                onChangeText={setYear}
                keyboardType="number-pad"
                maxLength={4}
                error={errors.year}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="Sayfa" value={pages} onChangeText={setPages} keyboardType="number-pad" maxLength={5} />
            </View>
          </View>
          <TextField
            label="ISBN"
            value={isbn}
            onChangeText={(v) => {
              setIsbn(v);
              setLookup({ loading: false, message: null });
            }}
            keyboardType="number-pad"
            error={errors.isbn}
            hint={isbnHint}
            editable={!completing}
            right={completing ? <Ionicons name="lock-closed-outline" size={18} color={c.textFaint} /> : undefined}
          />
          {isbn.replace(/\D/g, '').length >= 10 && !completing && !found ? (
            <LinkButton
              title="ISBN’den bilgileri getir"
              icon="refresh"
              onPress={fetchByIsbn}
              style={{ marginTop: -8 }}
            />
          ) : null}
          {lookup.loading ? (
            <AppText variant="small" muted>
              Aranıyor…
            </AppText>
          ) : null}
        </View>

        {!completing ? (
          <>
            <SectionLabel>Okuma durumu</SectionLabel>
            <View style={{ paddingHorizontal: space.lg }}>
              <Segmented options={STATUS_OPTIONS} value={status} onChange={setStatus} />
            </View>
            <SectionLabel>Konum</SectionLabel>
            <Row
              icon="location-outline"
              iconColor={c.text}
              title="Konum"
              value={locationPath ?? 'Seç'}
              onPress={() => setPicker(true)}
            />
          </>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { backgroundColor: c.bg, borderTopColor: c.hairline, paddingBottom: insets.bottom + space.md },
        ]}
      >
        <Button title={completing ? 'Bilgileri kaydet' : 'Kütüphaneye ekle'} onPress={save} />
      </View>

      <LocationPicker
        visible={picker}
        value={locationId}
        onClose={() => setPicker(false)}
        onSelect={(id) => {
          setLocationId(id);
          setPicker(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  coverRow: { flexDirection: 'row', gap: space.lg, padding: space.lg, alignItems: 'center' },
  smallButton: { minHeight: 40, paddingHorizontal: 16, borderRadius: radius.md },
  form: { paddingHorizontal: space.lg, gap: space.lg },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
