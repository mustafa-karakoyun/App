import { Ionicons } from '@expo/vector-icons';
import type { ReadingStatus } from '@kitaplik/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookCover } from '@/components/BookCover';
import { LocationPicker } from '@/components/LocationPicker';
import { ShelfIllustration } from '@/components/ShelfIllustration';
import { Sheet } from '@/components/Sheet';
import { AppText, Button, Chip, EmptyState, IconButton, LinkButton, Row, SectionLabel } from '@/components/ui';
import { useDbQuery } from '@/db/changes';
import { getKv, setKv } from '@/data/kv';
import { listLibrary, recentAdd, statusCounts, type LibraryItem, type SortKey } from '@/data/library';
import { listPendingScans } from '@/data/scans';
import { dueText, locative, STATUS_LABELS, STATUS_ORDER, untilText } from '@/lib/format';
import { radius, space, useTheme } from '@/theme';

const SORT_LABELS: Record<SortKey, string> = { recent: 'Son eklenen', title: 'Başlık', author: 'Yazar' };
const STATUS_CHIP: Record<ReadingStatus, string> = { ...STATUS_LABELS, abandoned: 'Yarıda' };

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
  const recent = useDbQuery(() => recentAdd(), [], ['kv', 'user_books']);
  const pendingScans = useDbQuery(() => listPendingScans().filter((s) => s.status !== 'failed'), [], ['pending_scans']);

  const filtered = !!search || !!status || !!location;
  const contentWidth = Math.min(width, 900) - space.lg * 2;
  const columns = Math.max(3, Math.floor(contentWidth / 120));
  const coverWidth = Math.floor((contentWidth - 14 * (columns - 1)) / columns);
  const ready = pendingScans.filter((p) => p.status === 'done');

  const clearFilters = () => {
    setSearch('');
    setStatus(null);
    setLocation(null);
  };

  const toggleView = () => {
    setKv('library.view', grid ? 'list' : 'grid');
    setGrid(!grid);
  };

  const subtitle = counts.all === 0 ? 'Henüz kitap yok' : filtered ? `${items.length} sonuç` : `${counts.all} kitap`;

  const header = (
    <View style={{ paddingTop: insets.top + space.lg }}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <AppText variant="display">Kütüphane</AppText>
          <AppText variant="sub" muted>
            {subtitle}
          </AppText>
        </View>
        {counts.all > 0 ? (
          <IconButton
            icon={grid ? 'list-outline' : 'grid-outline'}
            label={grid ? 'Liste görünümü' : 'Kapak görünümü'}
            onPress={toggleView}
            color={c.primary}
            size={24}
          />
        ) : null}
      </View>

      {counts.all > 0 ? (
        <>
          <View style={[styles.search, { backgroundColor: c.bgSunken }]}>
            <Ionicons name="search" size={22} color={c.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Başlık, yazar ya da ISBN"
              placeholderTextColor={c.textFaint}
              style={[styles.searchInput, { color: c.text }]}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Kütüphanede ara"
            />
            {search ? (
              <IconButton
                icon="close-circle"
                label="Aramayı temizle"
                onPress={() => setSearch('')}
                color={c.textMuted}
                size={20}
              />
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled"
          >
            {/* Aktif filtreler başta, dolu ve × ile kaldırılabilir. */}
            {location ? (
              <Chip
                label={location.path}
                icon="location-outline"
                selected
                removable
                onPress={() => setLocation(null)}
              />
            ) : null}
            {status ? (
              <Chip
                label={STATUS_CHIP[status]}
                count={counts[status]}
                selected
                removable
                onPress={() => setStatus(null)}
              />
            ) : null}
            {!location ? <Chip label="Konum" icon="location-outline" onPress={() => setPicker(true)} /> : null}
            <Chip label={SORT_LABELS[sort]} icon="swap-vertical" onPress={() => setSortSheet(true)} />
            {STATUS_ORDER.filter((s) => s !== status).map((s) => (
              <Chip key={s} label={STATUS_CHIP[s]} count={counts[s]} onPress={() => setStatus(s)} />
            ))}
          </ScrollView>

          {filtered ? (
            <View style={styles.filterHint}>
              <AppText variant="small" faint style={{ flex: 1 }} numberOfLines={1}>
                {location ? `${location.path} içindeki tüm raflar dahil` : ''}
              </AppText>
              <LinkButton title="Filtreleri temizle" onPress={clearFilters} />
            </View>
          ) : null}
        </>
      ) : null}

      {ready.length > 0 ? (
        <PendingBand
          tone="primary"
          icon="scan"
          title={`${ready.length} raf taraması onay bekliyor`}
          body="Bulunan kitapları kontrol edip ekle"
          onPress={() => router.push({ pathname: '/scan/review', params: { pending: ready[0]!.id } })}
        />
      ) : pendingScans.length > 0 ? (
        <PendingBand
          tone="warning"
          icon="time-outline"
          title="Raf fotoğrafı kuyrukta"
          body="İnternet gelince işlenecek"
        />
      ) : null}
    </View>
  );

  if (counts.all === 0) {
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 60 }}>
        {header}
        <EmptyState
          illustration={<ShelfIllustration />}
          title="Kitaplığını içeri al"
          body="Rafın fotoğrafını çek, sırtlardaki kitapları biz bulalım. Bir raf ≈ 20 kitap, 30 saniyede. İnternet olmasa da koleksiyonun hep yanında."
          action={
            <>
              <Button
                title="Rafı tara"
                icon="camera-outline"
                style={styles.fullButton}
                onPress={() => router.push({ pathname: '/scan', params: { mode: 'shelf' } })}
              />
              <Button
                title="Barkod okut"
                kind="secondary"
                icon="barcode-outline"
                style={styles.fullButton}
                onPress={() => router.push({ pathname: '/scan', params: { mode: 'barcode' } })}
              />
              <LinkButton title="ya da elle ekle" onPress={() => router.push('/book/add')} />
            </>
          }
        />
      </ScrollView>
    );
  }

  const describeFilters = [location?.path, status ? STATUS_LABELS[status] : null].filter(Boolean).join(' ve ');
  const empty = filtered ? (
    <EmptyState
      icon="search-outline"
      title="Eşleşen kitap yok"
      body={
        search
          ? `“${search}” ${describeFilters ? `${describeFilters} içinde` : 'kütüphanende'} yok.`
          : 'Bu filtrelerle kitap yok.'
      }
      action={
        <>
          <Button title="Filtreleri temizle" kind="secondary" compact onPress={clearFilters} />
          <LinkButton
            title="Kitap sende değilse barkodla ekle"
            onPress={() => router.push({ pathname: '/scan', params: { mode: 'barcode' } })}
          />
        </>
      }
    />
  ) : null;

  // Toplu eklemenin hemen ardından eklenenler ayrı bölümde, en üstte.
  const recentIds = !filtered && recent ? new Set(recent.ids) : null;
  const recentItems = recentIds ? items.filter((i) => recentIds.has(i.userBook.id)) : [];

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
          columnWrapperStyle={{ gap: 14, paddingHorizontal: space.lg }}
          contentContainerStyle={{ gap: 18, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <GridItem item={item} width={coverWidth} />}
        />
      ) : recentItems.length > 0 ? (
        <SectionList
          sections={[
            { key: 'recent', title: `Az önce eklendi${recent?.label ? ` · ${recent.label}` : ''}`, data: recentItems },
            { key: 'all', title: 'Tüm kitaplar', data: items.filter((i) => !recentIds!.has(i.userBook.id)) },
          ]}
          keyExtractor={(i) => i.userBook.id}
          ListHeaderComponent={header}
          renderSectionHeader={({ section }) =>
            section.data.length ? <SectionLabel style={{ backgroundColor: c.bg }}>{section.title}</SectionLabel> : null
          }
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <ListItem item={item} />}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.userBook.id}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentContainerStyle={{ paddingBottom: 60 }}
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
            right={sort === key ? <Ionicons name="checkmark" size={22} color={c.primary} /> : null}
            chevron={false}
          />
        ))}
      </Sheet>
    </View>
  );
}

function PendingBand({
  tone,
  icon,
  title,
  body,
  onPress,
}: {
  tone: 'primary' | 'warning';
  icon: 'scan' | 'time-outline';
  title: string;
  body: string;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const fg = tone === 'primary' ? c.primary : c.warning;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.band,
        { backgroundColor: tone === 'primary' ? c.primarySoft : c.warningSoft, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Ionicons name={icon} size={24} color={fg} />
      <View style={{ flex: 1 }}>
        <AppText variant="sub" style={{ fontWeight: '600' }}>
          {title}
        </AppText>
        <AppText variant="small" muted>
          {body}
        </AppText>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={22} color={fg} /> : null}
    </Pressable>
  );
}

/** Üçüncü satır: ödünçteyse kimde (gecikmede bordo), değilse konum; yanında okuma durumu. */
function MetaLine({ item }: { item: LibraryItem }) {
  const { c } = useTheme();
  const { userBook, locationPath, activeLoan } = item;
  const status =
    userBook.status !== 'to_read' ? (
      <AppText variant="small" color={c.primary} style={{ fontWeight: '600' }}>
        {`  ·  ${STATUS_CHIP[userBook.status]}`}
      </AppText>
    ) : null;
  if (activeLoan) {
    const due = activeLoan.dueAt ? dueText(activeLoan.dueAt) : null;
    const tone = due?.overdue ? c.accent : c.warning;
    const when = due ? (due.overdue ? due.text : untilText(activeLoan.dueAt!)) : 'tarihsiz';
    return (
      <View style={styles.meta}>
        <Ionicons name="swap-horizontal" size={15} color={tone} />
        <AppText variant="small" color={tone} style={{ fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
          {`${locative(activeLoan.borrowerName)} · ${when}`}
        </AppText>
      </View>
    );
  }
  return (
    <View style={styles.meta}>
      <Ionicons name="location-outline" size={15} color={c.textFaint} />
      <AppText variant="small" muted numberOfLines={1} style={{ flexShrink: 1 }}>
        {locationPath ?? 'Konumsuz'}
      </AppText>
      {status}
    </View>
  );
}

function ListItem({ item }: { item: LibraryItem }) {
  const { c } = useTheme();
  const { book, userBook, authors } = item;
  const pending = book.syncState === 'pending_isbn';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/book/${userBook.id}`)}
      style={({ pressed }) => [styles.listItem, { backgroundColor: pressed ? c.bgSunken : 'transparent' }]}
    >
      <BookCover uri={book.localCoverUri ?? book.coverUrl} title={book.title} width={48} pending={pending} />
      <View style={[styles.listText, { borderBottomColor: c.hairline }]}>
        <AppText variant="bookTitle" numberOfLines={2} muted={pending}>
          {pending ? 'Bilgisi bekleniyor' : book.title}
        </AppText>
        <AppText variant="secondary" muted numberOfLines={1}>
          {pending ? `ISBN ${book.isbn13}` : authors.join(', ') || 'Yazar bilinmiyor'}
        </AppText>
        <MetaLine item={item} />
      </View>
    </Pressable>
  );
}

function GridItem({ item, width }: { item: LibraryItem; width: number }) {
  const { book, userBook, authors, activeLoan } = item;
  const pending = book.syncState === 'pending_isbn';
  const lastName = (authors[0] ?? '').split(' ').pop() ?? '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={book.title}
      onPress={() => router.push(`/book/${userBook.id}`)}
      style={({ pressed }) => ({ width, opacity: pressed ? 0.7 : 1, gap: 2 })}
    >
      <BookCover
        uri={book.localCoverUri ?? book.coverUrl}
        title={book.title}
        width={width}
        pending={pending}
        badge={activeLoan ? 'Ödünçte' : null}
      />
      <AppText
        variant="bookTitle"
        numberOfLines={1}
        style={{ fontSize: 14, lineHeight: 18, marginTop: 6 }}
        muted={pending}
      >
        {pending ? 'Bilgisi bekleniyor' : book.title}
      </AppText>
      <AppText variant="small" muted numberOfLines={1} style={{ fontSize: 12 }}>
        {pending ? book.isbn13 : lastName}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.lg, paddingBottom: 14 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    paddingLeft: space.md,
    borderRadius: radius.md,
    minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: space.sm },
  chips: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    alignItems: 'center',
  },
  filterHint: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    gap: space.md,
  },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: space.lg,
    minHeight: 60,
    paddingVertical: 10,
  },
  listItem: { flexDirection: 'row', gap: 16, paddingLeft: space.lg, paddingTop: 12, alignItems: 'flex-start' },
  listText: {
    flex: 1,
    gap: 3,
    paddingRight: space.lg,
    paddingBottom: 12,
    minHeight: 84,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  fullButton: { alignSelf: 'stretch' },
});
