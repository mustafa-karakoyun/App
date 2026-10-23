import { Ionicons } from '@expo/vector-icons';
import type { ReadingStatus } from '@kitaplik/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookCover } from '@/components/BookCover';
import { LocationPicker } from '@/components/LocationPicker';
import { Sheet } from '@/components/Sheet';
import { AppText, Button, Chip, Divider, EmptyState, IconButton, Row } from '@/components/ui';
import { useDbQuery } from '@/db/changes';
import { getKv, setKv } from '@/data/kv';
import { listLibrary, statusCounts, type LibraryItem, type SortKey } from '@/data/library';
import { listPendingScans } from '@/data/scans';
import { dueText, STATUS_LABELS, STATUS_ORDER } from '@/lib/format';
import { radius, space, useTheme } from '@/theme';

const SORT_LABELS: Record<SortKey, string> = { recent: 'Son eklenen', title: 'Başlık', author: 'Yazar' };

export default function LibraryScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ReadingStatus | null>(null);
  const [location, setLocation] = useState<{ id: string; path: string } | null>(null);
  const [sort, setSort] = useState<SortKey>(() => (getKv('library.sort') as SortKey) ?? 'recent');
  const [grid, setGrid] = useState(() => getKv('library.view') === 'grid');
  const [picker, setPicker] = useState(false);
  const [sortSheet, setSortSheet] = useState(false);

  const items = useDbQuery(
    () => listLibrary({ search, status, locationId: location?.id ?? null, sort }),
    [search, status, location?.id, sort],
    ['user_books', 'books', 'locations', 'loans'],
  );
  const counts = useDbQuery(() => statusCounts(), [], ['user_books']);
  const pendingReview = useDbQuery(
    () => listPendingScans().filter((s) => s.status === 'done' || s.status === 'queued' || s.status === 'processing'),
    [],
    ['pending_scans'],
  );

  const filtered = !!search || !!status || !!location;
  const columns = Math.max(3, Math.floor((Math.min(width, 900) - space.lg * 2) / 120));
  const coverWidth = Math.floor((Math.min(width, 900) - space.lg * 2 - space.md * (columns - 1)) / columns);

  const toggleView = () => {
    setKv('library.view', grid ? 'list' : 'grid');
    setGrid(!grid);
  };

  const header = (
    <View style={{ paddingTop: insets.top + space.md }}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <AppText variant="display">Kütüphane</AppText>
          <AppText muted>{counts.all === 0 ? 'Henüz kitap yok' : `${counts.all} kitap`}</AppText>
        </View>
        {counts.all > 0 ? (
          <IconButton
            icon={grid ? 'list-outline' : 'grid-outline'}
            label={grid ? 'Liste görünümü' : 'Kapak görünümü'}
            onPress={toggleView}
          />
        ) : null}
      </View>

      {counts.all > 0 ? (
        <>
          <View style={[styles.search, { backgroundColor: c.bgSunken }]}>
            <Ionicons name="search" size={18} color={c.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Başlık, yazar ya da ISBN"
              placeholderTextColor={c.textFaint}
              style={[styles.searchInput, { color: c.text }]}
              returnKeyType="search"
              autoCorrect={false}
              clearButtonMode="while-editing"
              accessibilityLabel="Kütüphanede ara"
            />
            {search ? (
              <IconButton
                icon="close-circle"
                label="Aramayı temizle"
                onPress={() => setSearch('')}
                color={c.textFaint}
                size={18}
              />
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip
              label={location ? location.path : 'Konum'}
              icon="location-outline"
              selected={!!location}
              onPress={() => setPicker(true)}
            />
            <Chip label={SORT_LABELS[sort]} icon="swap-vertical" onPress={() => setSortSheet(true)} />
            <View style={[styles.chipDivider, { backgroundColor: c.hairline }]} />
            {STATUS_ORDER.map((s) => (
              <Chip
                key={s}
                label={STATUS_LABELS[s]}
                count={counts[s]}
                selected={status === s}
                onPress={() => setStatus(status === s ? null : s)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      {pendingReview.length > 0 ? (
        <>
          <Divider />
          <Row
            icon="images-outline"
            title={
              pendingReview.some((p) => p.status === 'done')
                ? `${pendingReview.filter((p) => p.status === 'done').length} raf taraması onay bekliyor`
                : 'Raf fotoğrafı kuyrukta'
            }
            subtitle={
              pendingReview.some((p) => p.status === 'done')
                ? 'Bulunan kitapları kontrol edip ekle'
                : 'İnternet gelince işlenecek, hazır olunca haber vereceğiz'
            }
            onPress={() => {
              const ready = pendingReview.find((p) => p.status === 'done');
              if (ready) router.push({ pathname: '/scan/review', params: { pending: ready.id } });
            }}
            chevron={pendingReview.some((p) => p.status === 'done')}
          />
          <Divider />
        </>
      ) : null}
    </View>
  );

  if (counts.all === 0) {
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1 }}>
        {header}
        <EmptyState
          icon="library-outline"
          title="Kitaplığını içeri al"
          body="Rafının fotoğrafını çek, sırtı görünen kitapları tek seferde ekleyelim. Ya da barkodu okutarak tek tek ekle."
          action={
            <View style={{ gap: space.sm, width: '100%', maxWidth: 320 }}>
              <Button
                title="Rafı tara"
                icon="scan"
                onPress={() => router.push({ pathname: '/scan', params: { mode: 'shelf' } })}
              />
              <Button
                title="Barkod okut"
                kind="secondary"
                icon="barcode-outline"
                onPress={() => router.push({ pathname: '/scan', params: { mode: 'barcode' } })}
              />
            </View>
          }
        />
      </ScrollView>
    );
  }

  const empty = filtered ? (
    <EmptyState
      icon="search-outline"
      title="Eşleşen kitap yok"
      body={search ? `“${search}” için kütüphanende sonuç bulunamadı.` : 'Bu filtrelerle kitap yok.'}
      action={
        <Button
          title="Filtreleri temizle"
          kind="secondary"
          compact
          onPress={() => {
            setSearch('');
            setStatus(null);
            setLocation(null);
          }}
        />
      }
    />
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {grid ? (
        <FlatList
          key={`grid-${columns}`}
          data={items}
          numColumns={columns}
          keyExtractor={(i) => i.userBook.id}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          columnWrapperStyle={{ gap: space.md, paddingHorizontal: space.lg }}
          contentContainerStyle={{ gap: space.lg, paddingBottom: space.xxl }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <GridItem item={item} width={coverWidth} />}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.userBook.id}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          ItemSeparatorComponent={() => <Divider inset={space.lg + 48 + space.md} />}
          contentContainerStyle={{ paddingBottom: space.xxl }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <ListItem item={item} />}
        />
      )}

      <LocationPicker
        visible={picker}
        value={location?.id ?? null}
        title="Konuma göre süz"
        onClose={() => setPicker(false)}
        onSelect={(id, path) => {
          setLocation(id && path ? { id, path } : null);
          setPicker(false);
        }}
      />
      <Sheet visible={sortSheet} onClose={() => setSortSheet(false)} title="Sırala">
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
          <Row
            key={key}
            title={SORT_LABELS[key]}
            onPress={() => {
              setSort(key);
              setKv('library.sort', key);
              setSortSheet(false);
            }}
            right={sort === key ? <Ionicons name="checkmark" size={20} color={c.primary} /> : null}
            chevron={false}
          />
        ))}
      </Sheet>
    </View>
  );
}

function ListItem({ item }: { item: LibraryItem }) {
  const { c } = useTheme();
  const { book, userBook, authors, locationPath, activeLoan } = item;
  const pending = book.syncState === 'pending_isbn';
  const loan = activeLoan?.dueAt ? dueText(activeLoan.dueAt) : null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/book/${userBook.id}`)}
      style={({ pressed }) => [styles.listItem, { backgroundColor: pressed ? c.bgSunken : 'transparent' }]}
    >
      <BookCover uri={book.localCoverUri ?? book.coverUrl} title={book.title} width={48} pending={pending} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bookTitle" numberOfLines={2}>
          {pending ? 'Bilgisi bekleniyor' : book.title}
        </AppText>
        <AppText muted numberOfLines={1}>
          {pending ? `ISBN ${book.isbn13}` : authors.join(', ') || 'Yazar bilinmiyor'}
        </AppText>
        <View style={styles.meta}>
          {activeLoan ? (
            <AppText variant="small" color={loan?.overdue ? c.accent : c.warning} numberOfLines={1}>
              {activeLoan.borrowerName}’de{loan ? ` · ${loan.text}` : ''}
            </AppText>
          ) : (
            <AppText variant="small" faint numberOfLines={1} style={{ flexShrink: 1 }}>
              {locationPath ?? 'Konumsuz'}
            </AppText>
          )}
          {userBook.status !== 'to_read' ? (
            <AppText variant="small" color={userBook.status === 'reading' ? c.primary : c.textFaint}>
              · {STATUS_LABELS[userBook.status]}
            </AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function GridItem({ item, width }: { item: LibraryItem; width: number }) {
  const { book, userBook, authors } = item;
  const pending = book.syncState === 'pending_isbn';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={book.title}
      onPress={() => router.push(`/book/${userBook.id}`)}
      style={({ pressed }) => ({ width, opacity: pressed ? 0.7 : 1, gap: 4 })}
    >
      <BookCover
        uri={book.localCoverUri ?? book.coverUrl}
        title={pending ? 'Bilgisi bekleniyor' : book.title}
        width={width}
        pending={pending}
      />
      <AppText variant="small" numberOfLines={2} style={{ fontWeight: '600' }}>
        {pending ? `ISBN ${book.isbn13}` : book.title}
      </AppText>
      <AppText variant="small" muted numberOfLines={1}>
        {authors[0] ?? ''}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: space.lg, paddingBottom: space.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    paddingLeft: space.md,
    borderRadius: radius.md,
    minHeight: 46,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: space.sm },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, alignItems: 'center' },
  chipDivider: { width: StyleSheet.hairlineWidth, height: 24, marginHorizontal: space.xs },
  listItem: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
