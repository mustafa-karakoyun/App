import { Ionicons } from '@expo/vector-icons';
import { toIsbn13, type Book } from '@kitaplik/shared';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookCover } from '@/components/BookCover';
import { LocationPicker } from '@/components/LocationPicker';
import { AppText, Button, Divider } from '@/components/ui';
import { getKv, setKv } from '@/data/kv';
import { addCatalogBook, addPendingIsbn, findOwnedByIsbn, removeFromLibrary, type LibraryItem } from '@/data/library';
import { locationPaths } from '@/data/locations';
import { api, ApiError, isOffline } from '@/lib/api';
import { formatIsbn, locative } from '@/lib/format';
import { goBack } from '@/lib/nav';
import { cam, radius, space, useTheme } from '@/theme';
import { CamButton, CamPanel, ScanFrame } from './chrome';

type Card =
  | { kind: 'loading'; isbn: string }
  | { kind: 'owned'; isbn: string; item: LibraryItem }
  | { kind: 'found'; isbn: string; book: Book }
  | { kind: 'added'; isbn: string; book: Book; userBookId: string }
  | { kind: 'offline'; isbn: string; added?: boolean }
  | { kind: 'not_found'; isbn: string }
  | { kind: 'not_isbn'; data: string };

/**
 * Barkod modu. Kitap kütüphanedeyse internetsiz "Bu kitap sende" der. Art arda
 * modunda okunan her kitap kart kapanmadan eklenir.
 */
export function BarcodeMode({ modeSwitcher }: { modeSwitcher: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [card, setCard] = useState<Card | null>(null);
  const [continuous, setContinuous] = useState(() => getKv('scan.continuous') === '1');
  const [sessionCount, setSessionCount] = useState(0);
  const [locationId, setLocationId] = useState<string | null>(() => getKv('scan.location'));
  const [picker, setPicker] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const lastScan = useRef<{ data: string; at: number }>({ data: '', at: 0 });
  const busy = useRef(false);

  const locationPath = locationId ? (locationPaths().get(locationId) ?? null) : null;

  const addBook = useCallback(
    (book: Book, isbn: string) => {
      const { userBook } = addCatalogBook(book, { addedVia: 'barcode', locationId });
      setSessionCount((n) => n + 1);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCard({ kind: 'added', isbn, book, userBookId: userBook.id });
    },
    [locationId],
  );

  const handleIsbn = useCallback(
    async (raw: string) => {
      const isbn = toIsbn13(raw);
      if (!isbn) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setCard({ kind: 'not_isbn', data: raw });
        return;
      }
      const owned = findOwnedByIsbn(isbn);
      if (owned) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setCard({ kind: 'owned', isbn, item: owned });
        return;
      }
      setCard({ kind: 'loading', isbn });
      try {
        const book = await api<Book>(`/books/isbn/${isbn}`, { timeoutMs: 10_000 });
        if (continuous) addBook(book, isbn);
        else {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setCard({ kind: 'found', isbn, book });
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setCard({ kind: 'not_found', isbn });
        } else {
          const offline = isOffline(err) || !(err instanceof ApiError);
          if (offline && continuous) {
            addPendingIsbn(isbn, { addedVia: 'barcode', locationId });
            setSessionCount((n) => n + 1);
          }
          setCard({ kind: 'offline', isbn, added: offline && continuous });
        }
      }
    },
    [addBook, continuous, locationId],
  );

  const onScanned = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      const t = Date.now();
      // Aynı barkod kamerada dururken defalarca okunmasın.
      if (busy.current || typing || (data === lastScan.current.data && t - lastScan.current.at < 3000)) return;
      // Tekli modda kart açıkken yeni okuma yapma.
      if (!continuous && card && card.kind !== 'loading') return;
      lastScan.current = { data, at: t };
      busy.current = true;
      try {
        await handleIsbn(data);
      } finally {
        busy.current = false;
      }
    },
    [card, continuous, handleIsbn, typing],
  );

  const next = () => {
    setCard(null);
    lastScan.current = { data: '', at: 0 };
  };

  const searchTyped = () => {
    const value = typed;
    setTyping(false);
    setTyped('');
    void handleIsbn(value);
  };

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a'] }}
        onBarcodeScanned={onScanned}
      />
      <View style={[StyleSheet.absoluteFill, styles.dim]} pointerEvents="none" />

      <View style={[styles.topBar, { top: insets.top + space.sm }]}>
        <CamButton icon="close" label="Kapat" onPress={goBack} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Eklenen kitapların konumu: ${locationPath ?? 'seçilmedi'}`}
          onPress={() => setPicker(true)}
          style={styles.locationPill}
        >
          <Ionicons name="location-outline" size={18} color={cam.success} />
          <AppText variant="label" color={cam.text} numberOfLines={1} style={{ flexShrink: 1, fontWeight: '600' }}>
            {locationPath ?? 'Konum seç'}
          </AppText>
          <Ionicons name="chevron-down" size={16} color={cam.muted} />
        </Pressable>
        <View style={{ width: 44 }} />
      </View>

      <View style={[styles.reticleWrap, { top: insets.top + 130 }]} pointerEvents="none">
        <View style={styles.window}>
          <ScanFrame style={styles.reticle} arm={26}>
            {card && card.kind !== 'not_isbn' ? (
              <View style={[styles.laser, { backgroundColor: cam.success }]} />
            ) : null}
          </ScanFrame>
        </View>
        <AppText variant="small" color={cam.text} style={styles.reticleText}>
          Kitabın arkasındaki barkodu çerçeveye getir
        </AppText>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.bottom}>
        {modeSwitcher}
        <CamPanel style={{ paddingBottom: insets.bottom + space.md, marginTop: space.lg }}>
          {typing ? (
            <View style={{ gap: space.md }}>
              <View>
                <AppText variant="title">ISBN’i yaz</AppText>
                <AppText variant="small" muted>
                  Arka kapakta, barkodun üstünde
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <TextInput
                  autoFocus
                  value={typed}
                  onChangeText={setTyped}
                  placeholder="978…"
                  placeholderTextColor={c.textFaint}
                  keyboardType="number-pad"
                  returnKeyType="search"
                  onSubmitEditing={searchTyped}
                  style={[styles.isbnInput, { color: c.text, borderColor: c.primary, backgroundColor: c.surface }]}
                  accessibilityLabel="ISBN numarası"
                />
                <Button
                  title="Ara"
                  compact
                  disabled={typed.replace(/\D/g, '').length < 10}
                  onPress={searchTyped}
                  style={{ minHeight: 48, paddingHorizontal: space.lg }}
                />
              </View>
              <Button title="Vazgeç" kind="ghost" compact onPress={() => setTyping(false)} />
            </View>
          ) : card ? (
            <ResultCard
              card={card}
              continuous={continuous}
              locationPath={locationPath}
              onAdd={() => {
                if (card.kind === 'found') addBook(card.book, card.isbn);
                if (card.kind === 'offline') {
                  addPendingIsbn(card.isbn, { addedVia: 'barcode', locationId });
                  setSessionCount((n) => n + 1);
                  setCard({ ...card, added: true });
                }
              }}
              onUndo={async () => {
                if (card.kind !== 'added') return;
                await removeFromLibrary(card.userBookId);
                setSessionCount((n) => Math.max(0, n - 1));
                setCard({ kind: 'found', isbn: card.isbn, book: card.book });
              }}
              onNext={next}
            />
          ) : (
            <>
              <View style={styles.idleRow}>
                <View style={{ flex: 1 }}>
                  <AppText style={{ fontWeight: '600' }}>Art arda okut</AppText>
                  <AppText variant="small" muted>
                    Okunan her kitap kartı kapatmadan eklenir
                  </AppText>
                </View>
                <Switch
                  value={continuous}
                  onValueChange={(v) => {
                    setContinuous(v);
                    setKv('scan.continuous', v ? '1' : '0');
                  }}
                  trackColor={{ true: c.primary, false: c.hairline }}
                  accessibilityLabel="Art arda okut"
                />
              </View>
              {sessionCount > 0 ? (
                <View style={styles.sessionRow}>
                  <Ionicons name="checkmark" size={16} color={c.primary} />
                  <AppText variant="small" color={c.primary} style={{ fontWeight: '600' }}>
                    {`${sessionCount} kitap eklendi${locationPath ? ` · ${locationPath}` : ''}`}
                  </AppText>
                </View>
              ) : null}
              <Divider />
              <Pressable accessibilityRole="button" onPress={() => setTyping(true)} style={styles.typeLink}>
                <Ionicons name="keypad-outline" size={20} color={c.primary} />
                <AppText color={c.primary} style={{ fontWeight: '600', fontSize: 15 }}>
                  Barkod okunmuyor mu? ISBN’i yaz
                </AppText>
              </Pressable>
            </>
          )}
        </CamPanel>
      </KeyboardAvoidingView>

      <LocationPicker
        visible={picker}
        value={locationId}
        title="Eklenen kitapların konumu"
        onClose={() => setPicker(false)}
        onSelect={(id) => {
          setLocationId(id);
          setKv('scan.location', id);
          setPicker(false);
        }}
      />
    </View>
  );
}

function ResultCard({
  card,
  continuous,
  locationPath,
  onAdd,
  onUndo,
  onNext,
}: {
  card: Card;
  continuous: boolean;
  locationPath: string | null;
  onAdd: () => void;
  onUndo: () => void;
  onNext: () => void;
}) {
  const { c } = useTheme();
  const twoButtons = (left: ReactNode, right: ReactNode) => (
    <View style={styles.twoButtons}>
      <View style={{ flex: 1 }}>{left}</View>
      <View style={{ flex: 1 }}>{right}</View>
    </View>
  );

  if (card.kind === 'loading') {
    return (
      <View style={styles.cardRow}>
        <View style={[styles.skeletonCover, { backgroundColor: c.bgSunken }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[styles.skeletonLine, { width: '80%', backgroundColor: c.bgSunken }]} />
          <View style={[styles.skeletonLine, { width: '45%', backgroundColor: c.bgSunken }]} />
          <AppText variant="small" muted>{`ISBN ${formatIsbn(card.isbn)} aranıyor…`}</AppText>
        </View>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (card.kind === 'owned') {
    const { item } = card;
    return (
      <View style={{ gap: space.lg }}>
        <View style={[styles.ownedBand, { backgroundColor: c.accent }]}>
          <Ionicons name="checkmark" size={24} color={c.bg} />
          <AppText color={c.bg} style={styles.ownedText}>
            BU KİTAP SENDE
          </AppText>
        </View>
        <View style={styles.cardRow}>
          <BookCover uri={item.book.localCoverUri ?? item.book.coverUrl} title={item.book.title} width={64} />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="cardTitle" numberOfLines={2}>
              {item.book.title}
            </AppText>
            <AppText variant="small" muted numberOfLines={1}>
              {item.authors.join(', ')}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <Ionicons name={item.activeLoan ? 'swap-horizontal' : 'location-outline'} size={22} color={c.accent} />
              <AppText color={c.accent} style={{ fontSize: 20, lineHeight: 24, fontWeight: '700', flexShrink: 1 }}>
                {item.activeLoan
                  ? `Şu an ${locative(item.activeLoan.borrowerName)}`
                  : (item.locationPath ?? 'Konumu girilmemiş')}
              </AppText>
            </View>
          </View>
        </View>
        {twoButtons(
          <Button title="Kitaba git" kind="secondary" onPress={() => router.replace(`/book/${item.userBook.id}`)} />,
          <Button title="Sıradaki" onPress={onNext} />,
        )}
      </View>
    );
  }

  if (card.kind === 'found' || card.kind === 'added') {
    const { book } = card;
    const details = [book.publisher, book.year, book.page_count ? `${book.page_count} sayfa` : null]
      .filter(Boolean)
      .join(' · ');
    const added = card.kind === 'added';
    return (
      <View style={{ gap: space.lg }}>
        <View style={styles.cardRow}>
          <View>
            <BookCover uri={book.cover_url} title={book.title} width={64} />
            {added ? (
              <View style={[styles.checkBadge, { backgroundColor: c.primary, borderColor: c.bg }]}>
                <Ionicons name="checkmark" size={14} color={c.primaryText} />
              </View>
            ) : null}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            {added ? (
              <AppText variant="overline" color={c.primary}>
                {`Eklendi${locationPath ? ` · ${locationPath}` : ''}`}
              </AppText>
            ) : null}
            <AppText variant="cardTitle" numberOfLines={2}>
              {book.title}
            </AppText>
            <AppText variant="small" muted numberOfLines={1}>
              {book.authors.join(', ')}
            </AppText>
            {!added && details ? (
              <AppText variant="small" faint numberOfLines={1}>
                {details}
              </AppText>
            ) : null}
          </View>
        </View>
        {added ? (
          <>
            {twoButtons(
              <Button title="Geri al" kind="secondary" onPress={onUndo} />,
              <Button title="Sıradaki kitap" onPress={onNext} />,
            )}
            <AppText variant="small" faint style={{ textAlign: 'center' }}>
              {continuous ? 'Sıradaki barkodu okutman yeterli.' : 'Konumu değiştirmek için üstteki hapa dokun'}
            </AppText>
          </>
        ) : (
          <>
            <Button title="Kütüphaneye ekle" icon="add" onPress={onAdd} />
            <AppText variant="small" faint style={{ textAlign: 'center' }}>
              {locationPath ? `${locationPath} konumuna eklenecek` : 'Konumsuz eklenecek; üstteki haptan seçebilirsin'}
            </AppText>
          </>
        )}
      </View>
    );
  }

  const message = (
    icon: 'cloud-offline-outline' | 'help-circle-outline' | 'alert-circle-outline',
    color: string,
    title: string,
    body: string,
    isbn?: string,
  ) => (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Ionicons name={icon} size={24} color={color} />
        <AppText style={{ fontWeight: '600', fontSize: 17 }}>{title}</AppText>
      </View>
      <AppText variant="small" muted>
        {body}
      </AppText>
      {isbn ? <AppText variant="small" style={{ fontWeight: '600' }}>{`ISBN ${formatIsbn(isbn)}`}</AppText> : null}
    </View>
  );

  if (card.kind === 'offline') {
    return (
      <View style={{ gap: space.lg }}>
        {message(
          'cloud-offline-outline',
          c.warning,
          card.added ? 'ISBN kaydedildi' : 'İnternet yok — sorun değil',
          'Kitap şimdilik ISBN ile eklenir; internet gelince kapak ve bilgiler kendiliğinden dolar.',
          card.isbn,
        )}
        {card.added ? (
          <Button title="Sıradaki kitap" onPress={onNext} />
        ) : (
          twoButtons(
            <Button title="Vazgeç" kind="secondary" onPress={onNext} />,
            <Button title="Yine de ekle" onPress={onAdd} />,
          )
        )}
      </View>
    );
  }

  if (card.kind === 'not_found') {
    return (
      <View style={{ gap: space.lg }}>
        {message(
          'help-circle-outline',
          c.text,
          'Bu ISBN hiçbir kaynakta yok',
          'Bilgileri bir kez gir; senden sonra okutan herkes için hazır olur. Yalnızca başlık zorunlu.',
          card.isbn,
        )}
        {twoButtons(
          <Button title="Sıradaki" kind="secondary" onPress={onNext} />,
          <Button
            title="Elle ekle"
            onPress={() => router.push({ pathname: '/book/add', params: { isbn: card.isbn } })}
          />,
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: space.lg }}>
      {message(
        'alert-circle-outline',
        c.accent,
        'Bu bir kitap barkodu değil',
        'Kitap barkodları 978 ya da 979 ile başlar. Arka kapaktaki ISBN barkodunu dene.',
      )}
      <Button title="Tekrar okut" kind="secondary" onPress={onNext} />
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: 'rgba(15,14,12,0.35)' },
  topBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: cam.scrim,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
    flexShrink: 1,
  },
  reticleWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: space.md },
  window: { width: 250, height: 190, alignItems: 'center', justifyContent: 'center' },
  reticle: { width: 232, height: 152, justifyContent: 'center' },
  laser: { height: 2, marginHorizontal: 14, opacity: 0.9 },
  reticleText: { textAlign: 'center', paddingHorizontal: space.xl, fontWeight: '600' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  ownedBand: {
    marginHorizontal: -space.lg,
    marginTop: -space.xs,
    height: 62,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  ownedText: { fontSize: 17, fontWeight: '700', letterSpacing: 1.5 },
  twoButtons: { flexDirection: 'row', gap: space.lg },
  checkBadge: {
    position: 'absolute',
    right: -8,
    bottom: -8,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonCover: { width: 64, height: 96, borderRadius: 2 },
  skeletonLine: { height: 14, borderRadius: 7 },
  idleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  isbnInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderWidth: 1.6,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 17,
    letterSpacing: 0.5,
  },
});
