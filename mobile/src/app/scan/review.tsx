import { Ionicons } from '@expo/vector-icons';
import type { Book, ScanItem, ScanResponse } from '@kitaplik/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookCover } from '@/components/BookCover';
import { LocationPicker } from '@/components/LocationPicker';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { AppText, Button, Divider, EmptyState, Row, SectionLabel, TextField } from '@/components/ui';
import { findOwnedByBookId } from '@/data/library';
import { addShelfSelections, confirmScan, getPendingScan, removePendingScan } from '@/data/scans';
import { api } from '@/lib/api';
import { radius, space, useTheme } from '@/theme';

type Selection = Record<number, number | null>;

/** Onay listesi: eşleşti (seçili gelir), doğrula (aday seç), bulunamadı (ara ya da atla). */
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
    matched: items.filter((i) => i.group === 'matched'),
    verify: items.filter((i) => i.group === 'verify'),
    not_found: items.filter((i) => i.group === 'not_found'),
  };
  const selectedCount = Object.values(selection).filter((v) => v !== null).length;

  const toggle = (item: ScanItem) => {
    setSelection((s) => ({
      ...s,
      [item.position]: s[item.position] === null || s[item.position] === undefined ? 0 : null,
    }));
  };

  const choose = (item: ScanItem, index: number | null) => {
    setSelection((s) => ({ ...s, [item.position]: index }));
    setChoosing(null);
  };

  /** Arama sonucundan seçilen kitabı adaylara ekleyip seçer. */
  const chooseBook = (item: ScanItem, book: Book) => {
    const existing = item.candidates.findIndex((cand) => cand.book.id === book.id);
    if (existing >= 0) return choose(item, existing);
    const updated: ScanItem = { ...item, candidates: [...item.candidates, { book, score: 1 }] };
    setItems((list) => list.map((i) => (i.position === item.position ? updated : i)));
    setSelection((s) => ({ ...s, [item.position]: updated.candidates.length - 1 }));
    setChoosing(null);
  };

  const save = async () => {
    setSaving(true);
    const selections = items.map((item) => ({ item, candidateIndex: selection[item.position] ?? null }));
    const { added, existed } = addShelfSelections(selections, location?.id ?? null);
    void confirmScan(result.scan_id, selections);
    removePendingScan(row.id);
    setSaving(false);
    router.dismissTo('/');
    toast(existed ? `${added} kitap eklendi · ${existed} tanesi zaten vardı` : `${added} kitap kütüphaneye eklendi`);
  };

  const discard = () => {
    removePendingScan(row.id);
    router.back();
  };

  const renderItem = (item: ScanItem) => {
    const idx = selection[item.position] ?? null;
    const chosen = idx !== null ? item.candidates[idx] : null;
    const shown = chosen ?? item.candidates[0] ?? null;
    const owned = shown ? findOwnedByBookId(shown.book.id) : null;
    const isSelected = idx !== null;
    const needsChoice = item.group !== 'matched' && !isSelected;

    return (
      <View key={item.position}>
        <View style={[styles.item, { paddingVertical: 0 }]}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            onPress={() => (needsChoice || !shown ? setChoosing(item) : toggle(item))}
            style={({ pressed }) => [styles.itemMain, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons
              name={isSelected ? 'checkmark-circle' : needsChoice ? 'help-circle-outline' : 'ellipse-outline'}
              size={26}
              color={isSelected ? c.primary : needsChoice ? c.warning : c.textFaint}
            />
            {shown && (isSelected || item.group === 'matched') ? (
              <BookCover uri={shown.book.cover_url} title={shown.book.title} width={40} />
            ) : null}
            <View style={{ flex: 1, gap: 2 }}>
              {shown && (isSelected || item.group === 'matched') ? (
                <>
                  <AppText variant="bookTitle" numberOfLines={2}>
                    {shown.book.title}
                  </AppText>
                  <AppText variant="small" muted numberOfLines={1}>
                    {[shown.book.authors.join(', '), shown.book.publisher].filter(Boolean).join(' · ')}
                  </AppText>
                </>
              ) : (
                <AppText variant="label" numberOfLines={2}>
                  {item.title ?? 'Okunamadı'}
                  {item.author ? <AppText muted>{` · ${item.author}`}</AppText> : null}
                </AppText>
              )}
              <AppText variant="small" faint numberOfLines={1}>
                Sırtta: {item.raw_text}
              </AppText>
              {owned ? (
                <AppText variant="small" color={c.accent}>
                  Zaten kütüphanende
                </AppText>
              ) : null}
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setChoosing(item)} style={styles.change}>
            <AppText variant="small" color={c.primary}>
              {needsChoice ? 'Seç' : 'Değiştir'}
            </AppText>
          </Pressable>
        </View>
        <Divider inset={space.lg + 26 + space.md} />
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: space.xs }}>
          <AppText variant="title">{items.length} kitap bulundu</AppText>
          <AppText muted>
            {groups.matched.length} eşleşti · {groups.verify.length} kontrol bekliyor · {groups.not_found.length}{' '}
            bulunamadı
          </AppText>
          {result.unreadable_count > 0 ? (
            <AppText variant="small" faint>
              {result.unreadable_count} sırt okunamadı; onları barkodla ekleyebilirsin.
            </AppText>
          ) : null}
        </View>

        <SectionLabel>Hepsinin konumu</SectionLabel>
        <Divider />
        <Row icon="location-outline" title="Konum" value={location?.path ?? 'Seç'} onPress={() => setPicker(true)} />
        <Divider />

        {groups.verify.length ? (
          <>
            <SectionLabel>{`Kontrol et (${groups.verify.length})`}</SectionLabel>
            <Divider />
            {groups.verify.map(renderItem)}
          </>
        ) : null}
        {groups.matched.length ? (
          <>
            <SectionLabel>{`Eşleşti (${groups.matched.length})`}</SectionLabel>
            <Divider />
            {groups.matched.map(renderItem)}
          </>
        ) : null}
        {groups.not_found.length ? (
          <>
            <SectionLabel>{`Bulunamadı (${groups.not_found.length})`}</SectionLabel>
            <Divider />
            {groups.not_found.map(renderItem)}
          </>
        ) : null}

        <View style={{ padding: space.lg }}>
          <Button title="Bu taramayı sil" kind="danger" compact onPress={discard} />
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
  const [query, setQuery] = useState([item.title, item.author].filter(Boolean).join(' '));
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

  return (
    <Sheet visible onClose={onClose} title="Hangi kitap?">
      <AppText variant="small" faint style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        Sırtta okunan: {item.raw_text}
      </AppText>
      {item.candidates.map((cand, i) => (
        <View key={cand.book.id}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: selected === i }}
            onPress={() => onChoose(i)}
            style={({ pressed }) => [styles.item, { backgroundColor: pressed ? c.bgSunken : 'transparent' }]}
          >
            <BookCover uri={cand.book.cover_url} title={cand.book.title} width={40} />
            <View style={{ flex: 1 }}>
              <AppText variant="bookTitle" numberOfLines={2}>
                {cand.book.title}
              </AppText>
              <AppText variant="small" muted numberOfLines={1}>
                {[cand.book.authors.join(', '), cand.book.publisher, cand.book.year].filter(Boolean).join(' · ')}
              </AppText>
            </View>
            {selected === i ? <Ionicons name="checkmark" size={22} color={c.primary} /> : null}
          </Pressable>
          <Divider inset={space.lg} />
        </View>
      ))}

      <View style={{ padding: space.lg, gap: space.md }}>
        <TextField
          label="Aradığın yoksa ara"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
          placeholder="Başlık ve yazar"
        />
        <Button title="Ara" kind="secondary" compact onPress={search} loading={loading} />
        {error ? <AppText color={c.accent}>{error}</AppText> : null}
      </View>
      {results ? (
        results.length === 0 ? (
          <AppText muted style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
            Sonuç yok. Kitabı sonra “Elle ekle” ile ekleyebilirsin.
          </AppText>
        ) : (
          <FlatList
            scrollEnabled={false}
            data={results}
            keyExtractor={(b) => b.id}
            ItemSeparatorComponent={() => <Divider inset={space.lg} />}
            renderItem={({ item: book }) => (
              <Pressable
                onPress={() => onChooseBook(book)}
                style={({ pressed }) => [styles.item, { backgroundColor: pressed ? c.bgSunken : 'transparent' }]}
              >
                <BookCover uri={book.cover_url} title={book.title} width={40} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bookTitle" numberOfLines={2}>
                    {book.title}
                  </AppText>
                  <AppText variant="small" muted numberOfLines={1}>
                    {[book.authors.join(', '), book.publisher].filter(Boolean).join(' · ')}
                  </AppText>
                </View>
              </Pressable>
            )}
          />
        )
      ) : null}
      {loading && !results ? <ActivityIndicator style={{ padding: space.lg }} color={c.primary} /> : null}

      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
        <Button title="Hiçbiri, bu kitabı atla" kind="ghost" onPress={() => onChoose(null)} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  change: { minHeight: 44, justifyContent: 'center', paddingLeft: space.sm },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  badge: { borderRadius: radius.pill },
});
