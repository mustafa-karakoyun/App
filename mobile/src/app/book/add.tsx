import { toIsbn13, type Book, type ReadingStatus } from '@kitaplik/shared';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BookCover } from '@/components/BookCover';
import { LocationPicker } from '@/components/LocationPicker';
import { useToast } from '@/components/Toast';
import { AppText, Button, Divider, Row, SectionLabel, Segmented, TextField } from '@/components/ui';
import { getKv } from '@/data/kv';
import { addCatalogBook, addManualBook, completePendingBook, findOwnedByIsbn } from '@/data/library';
import { locationPaths } from '@/data/locations';
import { preparePhoto } from '@/data/scans';
import { api, ApiError, isOffline } from '@/lib/api';
import { space, useTheme } from '@/theme';

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
  const completing = params.complete ?? null;

  const [title, setTitle] = useState(params.title ?? '');
  const [authors, setAuthors] = useState(params.author ?? '');
  const [publisher, setPublisher] = useState('');
  const [year, setYear] = useState('');
  const [pages, setPages] = useState('');
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
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [2, 3], quality: 0.8 });
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
      setLookup({ loading: false, message: 'Bilgiler dolduruldu.' });
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
      authors: authors.split(',').map((a) => a.trim()).filter(Boolean),
      publisher: publisher.trim() || null,
      year: yearNum,
      page_count: pages.trim() ? Number(pages) || null : null,
    };

    if (completing) {
      completePendingBook(completing, input, cover);
      toast('Bilgiler kaydedildi');
      router.back();
      return;
    }

    // Formu doldururken ISBN kaynaklarda bulunduysa katalog kaydını kullan.
    if (normalizedIsbn && lookup.message === 'Bilgiler dolduruldu.') {
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

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl * 2 }} keyboardShouldPersistTaps="handled">
        <View style={styles.coverRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Kapak fotoğrafı çek" onPress={() => pickCover(true)}>
            <BookCover uri={cover} title={title || 'Kapak'} width={84} />
          </Pressable>
          <View style={{ flex: 1, gap: space.sm }}>
            <AppText muted>Kapağın fotoğrafını çekersen kitabı listede kolay tanırsın.</AppText>
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              <Button title="Çek" icon="camera-outline" kind="secondary" compact onPress={() => pickCover(true)} />
              <Button title="Galeri" kind="ghost" compact onPress={() => pickCover(false)} />
            </View>
          </View>
        </View>

        <View style={styles.form}>
          <TextField
            label="Başlık"
            value={title}
            onChangeText={setTitle}
            placeholder="ör. Kürk Mantolu Madonna"
            autoFocus={!params.isbn && !completing}
            error={errors.title}
            returnKeyType="next"
          />
          <TextField
            label="Yazar"
            value={authors}
            onChangeText={setAuthors}
            placeholder="Birden fazlaysa virgülle ayır"
            autoCapitalize="words"
          />
          <TextField label="Yayınevi" value={publisher} onChangeText={setPublisher} placeholder="İsteğe bağlı" />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <TextField label="Yıl" value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} error={errors.year} />
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
            placeholder="Arka kapakta, barkodun üstünde"
            error={errors.isbn}
            hint={lookup.message ?? undefined}
            editable={!completing}
          />
          {isbn.replace(/\D/g, '').length >= 10 && !completing ? (
            <Button title="ISBN'den bilgileri getir" kind="ghost" compact onPress={fetchByIsbn} loading={lookup.loading} style={{ alignSelf: 'flex-start' }} />
          ) : null}
        </View>

        {!completing ? (
          <>
            <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
              <Segmented options={STATUS_OPTIONS} value={status} onChange={setStatus} />
            </View>
            <SectionLabel>Nerede</SectionLabel>
            <Divider />
            <Row icon="location-outline" title="Konum" value={locationPath ?? 'Seç'} onPress={() => setPicker(true)} />
            <Divider />
          </>
        ) : null}

        <View style={{ padding: space.lg }}>
          <Button title={completing ? 'Bilgileri kaydet' : 'Kütüphaneye ekle'} onPress={save} />
        </View>
      </ScrollView>

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
  form: { paddingHorizontal: space.lg, gap: space.lg },
});
