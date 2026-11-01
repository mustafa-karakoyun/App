import { Ionicons } from '@expo/vector-icons';
import type { Book, ScanCandidate, ScanItem, ScanResponse } from '@kitaplik/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookCover } from '@/components/BookCover';
import { LocationPicker } from '@/components/LocationPicker';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { AppText, Button, Divider, EmptyState, IconButton, LinkButton, SectionLabel } from '@/components/ui';
import { findOwnedByBookId, setRecentAdd, undoAdd } from '@/data/library';
import { addShelfSelections, confirmScan, getPendingScan, removePendingScan } from '@/data/scans';
import { api } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { radius, space, useTheme } from '@/theme';

type Selection = Record<number, number | null>;

function candidateMeta(book: Book, withYear = true) {
  return [book.publisher, withYear ? book.year : null, book.page_count ? `${book.page_count} s.` : null]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Onay listesi: kontrol bekleyenler en üstte (adaylar satır içinde), eşleşenler
 * seçili gelir, bulunamayanlar aranabilir. Hiçbir kitap onaysız eklenmez.
 */
export default function ReviewScreen() {
  const { pending } = useLocalSearchParams<{ pending: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const row = useMemo(() => getPendingScan(pending), [pending]);
  const result = useMemo(() => (row?.result ? (JSON.parse(row.result) as ScanResponse) : null), [row]);

  const [items, setItems] = useState<ScanItem[]>(() => result?.items ?? []);
  const [selection, setSelection] = useState<Selection>(() => {
    const s: Selection = {};
    for (const item of result?.items ?? []) {
      const owned = item.candidates[0] && findOwnedByBookId(item.candidates[0].book.id);
      s[item.position] = item.group === 'matched' && !owned ? 0 : null;
    }
    return s;
  });
  // Kontrol bekleyenlerden ilki açık gelir: kullanıcı nereden başlayacağını bilsin.
  const [expanded, setExpanded] = useState<number | null>(
    () => result?.items.find((i) => i.group === 'verify' && i.candidates.length > 1)?.position ?? null,
  );
  const [location, setLocation] = useState<{ id: string; path: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const [choosing, setChoosing] = useState<ScanItem | null>(null);
  const [saving, setSaving] = useState(false);

  if (!row || !result) {
    return (
      <EmptyState
        icon="images-outline"
        title="Tarama bulunamadı"
        body="Bu tarama zaten eklenmiş ya da silinmiş olabilir."
      />
    );
  }

  const groups = {
    verify: items.filter((i) => i.group === 'verify'),
    matched: items.filter((i) => i.group === 'matched'),
    not_found: items.filter((i) => i.group === 'not_found'),
  };
  const selectedCount = Object.values(selection).filter((v) => v !== null).length;

  const choose = (item: ScanItem, index: number | null) => {
    setSelection((s) => ({ ...s, [item.position]: index }));
    setChoosing(null);
    if (expanded === item.position) {
      // Sıradaki karar bekleyen satırı aç.
      const nextVerify = groups.verify.find(
        (v) => v.position !== item.position && (selection[v.position] ?? null) === null && v.candidates.length > 1,
      );
      setExpanded(nextVerify?.position ?? null);
    }
  };

  const toggle = (item: ScanItem) => {
    setSelection((s) => ({ ...s, [item.position]: (s[item.position] ?? null) === null ? 0 : null }));
  };

  /** Arama sonucundan seçilen kitabı adaylara ekleyip seçer. */
  const chooseBook = (item: ScanItem, book: Book) => {
    const existing = item.candidates.findIndex((cand) => cand.book.id === book.id);
    if (existing >= 0) return choose(item, existing);
    const updated: ScanItem = { ...item, candidates: [...item.candidates, { book, score: 1 }] };
    setItems((list) => list.map((i) => (i.position === item.position ? updated : i)));
    choose(updated, updated.candidates.length - 1);
  };

  const selectAll = () => {
    setSelection((s) => {
      const next = { ...s };
      for (const item of items) {
        if ((next[item.position] ?? null) !== null || item.candidates.length === 0) continue;
        if (item.group === 'matched' && !findOwnedByBookId(item.candidates[0]!.book.id)) next[item.position] = 0;
      }
      return next;
    });
  };

  const save = () => {
    setSaving(true);
    const selections = items.map((item) => ({ item, candidateIndex: selection[item.position] ?? null }));
    const { added, existed, addedIds } = addShelfSelections(selections, location?.id ?? null);
    void confirmScan(result.scan_id, selections);
    removePendingScan(row.id);
    setRecentAdd(addedIds, location?.path ?? null);
    setSaving(false);
    router.dismissTo('/');
    toast({
      message: existed ? `${added} kitap eklendi · ${existed} tanesi zaten vardı` : `${added} kitap eklendi`,
      actionLabel: addedIds.length ? 'Geri al' : undefined,
      onAction: () => void undoAdd(addedIds),
      durationMs: 7000,
    });
  };

  const discard = () => {
    removePendingScan(row.id);
    goBack();
  };

  const renderItem = (item: ScanItem, last: boolean) => {
    const idx = selection[item.position] ?? null;
    const chosen = idx !== null ? item.candidates[idx] : null;
    const shown = chosen ?? item.candidates[0] ?? null;
    const owned = shown ? findOwnedByBookId(shown.book.id) : null;
    const isSelected = idx !== null;
    const verify = item.group === 'verify' && !isSelected;
    const notFound = !shown;

    if (verify && expanded === item.position) {
      return (
        <View key={item.position}>
          <View style={styles.expanded}>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Ionicons name="help-circle-outline" size={28} color={c.warning} />
              <View style={{ flex: 1 }}>
                <AppText variant="small" color={c.warning} style={{ fontWeight: '600' }} numberOfLines={2}>
                  {`Sırtta: ${item.raw_text}`}
                </AppText>
                <AppText variant="small" muted>
                  {item.candidates.length === 2 ? 'İki baskı olabilir, hangisi sende?' : 'Hangisi sende?'}
                </AppText>
              </View>
            </View>
            <View style={{ gap: space.sm, paddingLeft: 40 }}>
              {item.candidates.slice(0, 3).map((cand, i) => (
                <InlineCandidate key={cand.book.id} cand={cand} selected={idx === i} onPress={() => choose(item, i)} />
              ))}
              <View style={styles.inlineLinks}>
                <LinkButton title="Başka bir kitap ›" onPress={() => setChoosing(item)} />
                <LinkButton title="Atla" color={c.textMuted} onPress={() => choose(item, null)} />
              </View>
            </View>
          </View>
          {!last ? <Divider /> : null}
        </View>
      );
    }

    const subtitle = notFound
      ? null
      : verify
        ? `${shown.book.authors[0]?.split(' ').pop() ?? ''} · ${item.candidates.length} aday`
        : [shown.book.authors.join(', '), shown.book.publisher].filter(Boolean).join(' · ');

    return (
      <View
        key={item.position}
        style={[styles.item, { borderBottomColor: c.hairline, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth }]}
      >
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isSelected }}
          onPress={() => (verify ? setExpanded(item.position) : notFound ? setChoosing(item) : toggle(item))}
          style={({ pressed }) => [styles.itemMain, { opacity: pressed ? 0.6 : 1 }]}
        >
          {verify ? (
            <Ionicons name="help-circle-outline" size={28} color={c.warning} />
          ) : isSelected ? (
            <Ionicons name="checkmark-circle" size={28} color={c.primary} />
          ) : (
            <View style={[styles.emptyCheck, { borderColor: c.textFaint }]} />
          )}
          <BookCover uri={shown?.book.cover_url} title={shown?.book.title ?? ''} width={44} pending={notFound} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText
              variant="bookTitle"
              numberOfLines={2}
              muted={notFound}
              style={notFound ? { fontWeight: '400' } : undefined}
            >
              {notFound ? 'Eşleşme yok' : shown.book.title}
            </AppText>
            {subtitle ? (
              <AppText variant="small" muted numberOfLines={1}>
                {subtitle}
              </AppText>
            ) : null}
            <AppText variant="spine" faint numberOfLines={1}>
              {`Sırtta: ${item.raw_text}`}
            </AppText>
            {owned ? (
              <AppText variant="small" color={c.accent} style={{ fontWeight: '600' }}>
                Zaten kütüphanende
              </AppText>
            ) : null}
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setChoosing(item)} style={styles.change}>
          <AppText color={c.primary} style={{ fontWeight: '600', fontSize: 15 }}>
            {verify || notFound ? 'Seç' : 'Değiştir'}
          </AppText>
        </Pressable>
      </View>
    );
  };

  const section = (title: string, list: ScanItem[], color?: string) =>
    list.length ? (
      <>
        <SectionLabel color={color}>{`${title} · ${list.length}`}</SectionLabel>
        {list.map((item, i) => renderItem(item, i === list.length - 1))}
      </>
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: 'Raf taraması',
          headerTitleAlign: 'center',
          headerTitleStyle: { fontSize: 16, fontWeight: '600', color: c.text },
          headerLeft: () => <IconButton icon="close" label="Kapat" onPress={goBack} />,
          headerRight: () => <LinkButton title="Tümünü seç" onPress={selectAll} />,
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: 4 }}>
          <AppText variant="heading">{`${items.length} kitap bulundu`}</AppText>
          <AppText variant="secondary" muted>
            {`${groups.matched.length} eşleşti · `}
            <AppText variant="secondary" color={c.warning} style={{ fontWeight: '600' }}>
              {`${groups.verify.length} kontrol bekliyor`}
            </AppText>
            {` · ${groups.not_found.length} bulunamadı`}
          </AppText>
          {result.unreadable_count > 0 ? (
            <LinkButton
              title={`${result.unreadable_count} sırt okunamadı; onları barkodla ekleyebilirsin ›`}
              onPress={() => router.push({ pathname: '/scan', params: { mode: 'barcode' } })}
              style={{ minHeight: 26 }}
            />
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => setPicker(true)}
          style={({ pressed }) => [styles.locationRow, { backgroundColor: c.bgSunken, opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="location-outline" size={22} color={c.text} />
          <AppText style={{ flex: 1, fontWeight: '600' }}>Hepsinin konumu</AppText>
          <AppText variant="sub" muted numberOfLines={1} style={{ maxWidth: '45%' }}>
            {location?.path ?? 'Seç'}
          </AppText>
          <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
        </Pressable>

        {section('Kontrol et', groups.verify, c.warning)}
        {section('Eşleşti', groups.matched)}
        {section('Bulunamadı', groups.not_found)}

        <View style={{ alignItems: 'center', paddingTop: space.xxl, gap: 4 }}>
          <LinkButton title="Bu taramayı sil" color={c.accent} onPress={discard} />
          <AppText variant="small" faint>
            Fotoğraf zaten saklanmıyor; yalnızca bu liste silinir.
          </AppText>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { backgroundColor: c.bg, borderTopColor: c.hairline, paddingBottom: insets.bottom + space.md },
        ]}
      >
        <Button
          title={selectedCount ? `${selectedCount} kitabı kütüphaneye ekle` : 'Eklenecek kitap seç'}
          onPress={save}
          loading={saving}
          disabled={!selectedCount}
        />
      </View>

      <LocationPicker
        visible={picker}
        value={location?.id ?? null}
        title="Bu raftaki kitapların konumu"
        onClose={() => setPicker(false)}
        onSelect={(id, path) => {
          setLocation(id && path ? { id, path } : null);
          setPicker(false);
        }}
      />
      {choosing ? (
        <CandidateSheet
          item={choosing}
          selected={selection[choosing.position] ?? null}
          onClose={() => setChoosing(null)}
          onChoose={(i) => choose(choosing, i)}
          onChooseBook={(b) => chooseBook(choosing, b)}
        />
      ) : null}
    </View>
  );
}

function InlineCandidate({ cand, selected, onPress }: { cand: ScanCandidate; selected: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.inline,
        {
          backgroundColor: selected ? c.primarySoft : c.surface,
          borderColor: selected ? c.primary : c.hairline,
          borderWidth: selected ? 1.4 : 1,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <BookCover uri={cand.book.cover_url} title={cand.book.title} width={30} />
      <View style={{ flex: 1 }}>
        <AppText variant="serifBody" style={{ fontWeight: '600' }} numberOfLines={1}>
          {cand.book.title}
        </AppText>
        <AppText variant="small" muted numberOfLines={1} style={{ fontSize: 12 }}>
          {candidateMeta(cand.book)}
        </AppText>
      </View>
      {selected ? (
        <Ionicons name="checkmark-circle" size={22} color={c.primary} />
      ) : (
        <View style={[styles.radio, { borderColor: c.textFaint }]} />
      )}
    </Pressable>
  );
}

/** Aday seçimi: puan sırasıyla adaylar, kitapta ara, hiçbiri/atla. */
function CandidateSheet({
  item,
  selected,
  onClose,
  onChoose,
  onChooseBook,
}: {
  item: ScanItem;
  selected: number | null;
  onClose: () => void;
  onChoose: (index: number | null) => void;
  onChooseBook: (book: Book) => void;
}) {
  const { c } = useTheme();
  const [query, setQuery] = useState(item.candidates.length ? '' : [item.title, item.author].filter(Boolean).join(' '));
  const [results, setResults] = useState<Book[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ books: Book[] }>(`/books/search?q=${encodeURIComponent(query.trim())}&external=1`);
      setResults(res.books);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const bookRow = (book: Book, isSelected: boolean, onPress: () => void, key: string) => (
    <View key={key}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: isSelected }}
        onPress={onPress}
        style={({ pressed }) => [styles.sheetRow, { backgroundColor: pressed ? c.bgSunken : 'transparent' }]}
      >
        <BookCover uri={book.cover_url} title={book.title} width={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bookTitle" numberOfLines={2}>
            {book.title}
          </AppText>
          <AppText variant="small" muted numberOfLines={1}>
            {[book.authors.join(', '), book.publisher, book.year].filter(Boolean).join(' · ')}
          </AppText>
        </View>
        {isSelected ? <Ionicons name="checkmark" size={24} color={c.primary} /> : null}
      </Pressable>
      <Divider inset={space.lg + 44 + space.md} />
    </View>
  );

  return (
    <Sheet visible onClose={onClose} title="Hangi kitap?" subtitle={`Sırtta: ${item.raw_text}`}>
      {item.candidates.map((cand, i) => bookRow(cand.book, selected === i, () => onChoose(i), cand.book.id))}

      <SectionLabel>Aradığın yoksa ara</SectionLabel>
      <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
        <View style={[styles.search, { backgroundColor: c.bgSunken }]}>
          <Ionicons name="search" size={22} color={c.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            returnKeyType="search"
            placeholder="Başlık, yazar ya da ISBN"
            placeholderTextColor={c.textFaint}
            style={{ flex: 1, fontSize: 16, color: c.text, paddingVertical: space.sm }}
            accessibilityLabel="Kitap ara"
          />
          {loading ? <ActivityIndicator color={c.primary} style={{ marginRight: space.md }} /> : null}
        </View>
        {error ? <AppText color={c.accent}>{error}</AppText> : null}
      </View>
      {results ? (
        results.length === 0 ? (
          <AppText muted style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
            Sonuç yok. Kitabı sonra “Elle ekle” ile ekleyebilirsin.
          </AppText>
        ) : (
          <View style={{ paddingTop: space.sm }}>
            {results.map((book) => bookRow(book, false, () => onChooseBook(book), `r-${book.id}`))}
          </View>
        )
      ) : null}

      <View style={{ alignItems: 'center', paddingVertical: space.xl }}>
        <LinkButton title="Hiçbiri, bu kitabı atla" color={c.accent} onPress={() => onChoose(null)} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    minHeight: 52,
    marginTop: space.lg,
  },
  item: { flexDirection: 'row', alignItems: 'center', marginLeft: space.lg, paddingRight: space.lg },
  itemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    minHeight: 96,
  },
  emptyCheck: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, marginHorizontal: 1 },
  change: { minHeight: 44, justifyContent: 'center', paddingLeft: space.sm },
  expanded: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.seg,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 },
  inlineLinks: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.md,
    borderRadius: radius.md,
    minHeight: 44,
  },
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
