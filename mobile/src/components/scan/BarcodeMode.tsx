import { Ionicons } from '@expo/vector-icons';
import { toIsbn13, type Book } from '@kitaplik/shared';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookCover } from '@/components/BookCover';
import { LocationPicker } from '@/components/LocationPicker';
import { AppText, Button, IconButton } from '@/components/ui';
import { getKv, setKv } from '@/data/kv';
import { addCatalogBook, addPendingIsbn, findOwnedByIsbn, type LibraryItem } from '@/data/library';
import { locationPaths } from '@/data/locations';
import { api, ApiError, isOffline } from '@/lib/api';
import { radius, space, useTheme } from '@/theme';

type Card =
  | { kind: 'loading'; isbn: string }
  | { kind: 'owned'; isbn: string; item: LibraryItem }
  | { kind: 'found'; isbn: string; book: Book; added?: boolean }
  | { kind: 'not_found'; isbn: string }
  | { kind: 'offline'; isbn: string; added?: boolean }
  | { kind: 'not_isbn'; data: string };

/**
 * Barkod modu. Kitap kütüphanedeyse internetsiz "Bu kitap sende" der. Art arda
 * modunda okunan her kitap kart kapanmadan eklenir.
 */
export function BarcodeMode({ footer }: { footer: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [card, setCard] = useState<Card | null>(null);
  const [continuous, setContinuous] = useState(() => getKv('scan.continuous') === '1');
  const [session, setSession] = useState<string[]>([]);
  const [locationId, setLocationId] = useState<string | null>(() => getKv('scan.location'));
  const [picker, setPicker] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const lastScan = useRef<{ data: string; at: number }>({ data: '', at: 0 });
  const busy = useRef(false);

  const locationPath = locationId ? (locationPaths().get(locationId) ?? null) : null;

  const handleIsbn = useCallback(
    async (raw: string) => {
      const isbn = toIsbn13(raw);
      if (!isbn) {
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
        if (continuous) {
          addCatalogBook(book, { addedVia: 'barcode', locationId });
          setSession((s) => [book.title, ...s]);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setCard({ kind: 'found', isbn, book, added: true });
        } else {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setCard({ kind: 'found', isbn, book });
        }
      } catch (err) {
        if (isOffline(err)) {
          if (continuous) {
            addPendingIsbn(isbn, { addedVia: 'barcode', locationId });
            setSession((s) => [`ISBN ${isbn}`, ...s]);
          }
          setCard({ kind: 'offline', isbn, added: continuous });
        } else if (err instanceof ApiError && err.status === 404) {
          setCard({ kind: 'not_found', isbn });
        } else {
          setCard({ kind: 'offline', isbn });
        }
      }
    },
    [continuous, locationId],
  );

  const onScanned = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      const t = Date.now();
      // Aynı barkod kamerada dururken defalarca okunmasın.
      if (busy.current || (data === lastScan.current.data && t - lastScan.current.at < 3000)) return;
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
    [card, continuous, handleIsbn],
  );

  const addCurrent = () => {
    if (card?.kind === 'found') {
      addCatalogBook(card.book, { addedVia: 'barcode', locationId });
      setSession((s) => [card.book.title, ...s]);
      setCard({ ...card, added: true });
    } else if (card?.kind === 'offline') {
      addPendingIsbn(card.isbn, { addedVia: 'barcode', locationId });
      setSession((s) => [`ISBN ${card.isbn}`, ...s]);
      setCard({ ...card, added: true });
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const dismiss = () => {
    setCard(null);
    lastScan.current = { data: '', at: 0 };
  };

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a'] }}
        onBarcodeScanned={onScanned}
      />

      <View style={[styles.topBar, { top: insets.top + space.sm }]}>
        <Pressable accessibilityRole="button" onPress={() => setPicker(true)} style={styles.locationPill}>
          <Ionicons name="location-outline" size={16} color="#F5F0E6" />
          <AppText variant="label" color="#F5F0E6" numberOfLines={1} style={{ flexShrink: 1 }}>
            {locationPath ?? 'Konum seç'}
          </AppText>
        </Pressable>
      </View>

      <View style={styles.reticleWrap} pointerEvents="none">
        <View style={styles.reticle} />
        <AppText color="#F5F0E6" style={styles.reticleText}>
          Kitabın arkasındaki barkodu çerçeveye getir
        </AppText>
      </View>

      <View style={styles.bottom}>
        <View style={[styles.panel, { backgroundColor: c.bg }]}>
          {card ? (
            <ResultCard card={card} continuous={continuous} onAdd={addCurrent} onDismiss={dismiss} locationPath={locationPath} />
          ) : typing ? (
            <View style={{ gap: space.md }}>
              <TextInput
                autoFocus
                value={typed}
                onChangeText={setTyped}
                placeholder="ISBN numarası"
                placeholderTextColor={c.textFaint}
                keyboardType="number-pad"
                style={[styles.isbnInput, { color: c.text, borderColor: c.hairline, backgroundColor: c.surface }]}
                onSubmitEditing={() => {
                  setTyping(false);
                  void handleIsbn(typed);
                  setTyped('');
                }}
              />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button title="Vazgeç" kind="ghost" compact onPress={() => setTyping(false)} style={{ flex: 1 }} />
                <Button
                  title="Ara"
                  compact
                  disabled={typed.replace(/\D/g, '').length < 10}
                  style={{ flex: 1 }}
                  onPress={() => {
                    setTyping(false);
                    void handleIsbn(typed);
                    setTyped('');
                  }}
                />
              </View>
            </View>
          ) : (
            <View style={styles.idleRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="label">Art arda okut</AppText>
                <AppText variant="small" muted>
                  {session.length ? `${session.length} kitap eklendi` : 'Okunan her kitap hemen eklenir'}
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
          )}
          {!card && !typing ? (
            <Pressable accessibilityRole="button" onPress={() => setTyping(true)} style={styles.typeLink}>
              <AppText variant="small" color={c.primary}>
                Barkod okunmuyor mu? ISBN’i yaz
              </AppText>
            </Pressable>
          ) : null}
        </View>
        <View style={{ backgroundColor: '#0F0E0C', paddingTop: space.md }}>{footer}</View>
      </View>

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
  onAdd,
  onDismiss,
  locationPath,
}: {
  card: Card;
  continuous: boolean;
  onAdd: () => void;
  onDismiss: () => void;
  locationPath: string | null;
}) {
  const { c } = useTheme();
  const close = <IconButton icon="close" label="Kapat" onPress={onDismiss} color={c.textMuted} />;

  if (card.kind === 'loading') {
    return (
      <View style={styles.cardRow}>
        <ActivityIndicator color={c.primary} />
        <AppText muted style={{ flex: 1 }}>
          ISBN {card.isbn} aranıyor…
        </AppText>
      </View>
    );
  }

  if (card.kind === 'owned') {
    const { item } = card;
    return (
      <View style={{ gap: space.md }}>
        <View style={styles.cardRow}>
          <BookCover uri={item.book.localCoverUri ?? item.book.coverUrl} title={item.book.title} width={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="overline" color={c.accent}>
              Bu kitap sende
            </AppText>
            <AppText variant="bookTitle" numberOfLines={2}>
              {item.book.title}
            </AppText>
            <AppText muted numberOfLines={1}>
              {item.activeLoan ? `Şu an ${item.activeLoan.borrowerName}’de` : (item.locationPath ?? 'Konumu girilmemiş')}
            </AppText>
          </View>
          {close}
        </View>
        <Button title="Kitaba git" kind="secondary" compact onPress={() => router.replace(`/book/${item.userBook.id}`)} />
      </View>
    );
  }

  if (card.kind === 'found') {
    return (
      <View style={{ gap: space.md }}>
        <View style={styles.cardRow}>
          <BookCover uri={card.book.cover_url} title={card.book.title} width={52} />
          <View style={{ flex: 1, gap: 2 }}>
            {card.added ? (
              <AppText variant="overline" color={c.primary}>
                Eklendi{locationPath ? ` · ${locationPath}` : ''}
              </AppText>
            ) : null}
            <AppText variant="bookTitle" numberOfLines={2}>
              {card.book.title}
            </AppText>
            <AppText muted numberOfLines={1}>
              {card.book.authors.join(', ')}
            </AppText>
          </View>
          {close}
        </View>
        {card.added ? (
          continuous ? (
            <AppText variant="small" muted>
              Sıradaki kitabı okut.
            </AppText>
          ) : (
            <Button title="Sıradaki kitap" kind="secondary" compact onPress={onDismiss} />
          )
        ) : (
          <Button title="Kütüphaneye ekle" icon="add" onPress={onAdd} />
        )}
      </View>
    );
  }

  if (card.kind === 'offline') {
    return (
      <View style={{ gap: space.md }}>
        <View style={styles.cardRow}>
          <Ionicons name="cloud-offline-outline" size={26} color={c.textMuted} />
          <View style={{ flex: 1 }}>
            <AppText variant="label">{card.added ? 'ISBN kaydedildi' : 'İnternet yok'}</AppText>
            <AppText variant="small" muted>
              Kitap şimdilik ISBN ile eklenir; internet gelince kapak ve bilgiler dolar.
            </AppText>
          </View>
          {close}
        </View>
        {!card.added ? <Button title="Yine de ekle" onPress={onAdd} /> : null}
      </View>
    );
  }

  if (card.kind === 'not_found') {
    return (
      <View style={{ gap: space.md }}>
        <View style={styles.cardRow}>
          <Ionicons name="help-circle-outline" size={26} color={c.textMuted} />
          <View style={{ flex: 1 }}>
            <AppText variant="label">Bu ISBN hiçbir kaynakta yok</AppText>
            <AppText variant="small" muted>
              Bilgileri bir kez gir; senden sonra okutan herkes için hazır olur.
            </AppText>
          </View>
          {close}
        </View>
        <Button title="Elle ekle" onPress={() => router.push({ pathname: '/book/add', params: { isbn: card.isbn } })} />
      </View>
    );
  }

  return (
    <View style={styles.cardRow}>
      <Ionicons name="alert-circle-outline" size={26} color={c.textMuted} />
      <View style={{ flex: 1 }}>
        <AppText variant="label">Bu bir kitap barkodu değil</AppText>
        <AppText variant="small" muted>
          Kitap barkodları 978 ya da 979 ile başlar.
        </AppText>
      </View>
      {close}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', left: 64, right: 64, alignItems: 'center' },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,14,12,0.6)',
    paddingHorizontal: space.md,
    minHeight: 40,
    borderRadius: radius.pill,
    maxWidth: '100%',
  },
  reticleWrap: { position: 'absolute', top: '22%', left: 0, right: 0, alignItems: 'center', gap: space.md },
  reticle: { width: '72%', maxWidth: 340, height: 120, borderWidth: 2, borderColor: 'rgba(245,240,230,0.85)', borderRadius: radius.md },
  reticleText: { textAlign: 'center', paddingHorizontal: space.xl, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  panel: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  idleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  typeLink: { minHeight: 36, justifyContent: 'center' },
  isbnInput: { minHeight: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 18, letterSpacing: 1 },
});
