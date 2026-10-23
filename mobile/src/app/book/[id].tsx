import type { ReadingStatus } from '@kitaplik/shared';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { BookCover } from '@/components/BookCover';
import { LendSheet } from '@/components/LendSheet';
import { LocationPicker } from '@/components/LocationPicker';
import { useToast } from '@/components/Toast';
import { AppText, Button, Divider, EmptyState, Row, SectionLabel, Segmented } from '@/components/ui';
import { useDbQuery } from '@/db/changes';
import { getLibraryItem, removeFromLibrary, setLocalCover, updateUserBook } from '@/data/library';
import { returnLoan } from '@/data/loans';
import { preparePhoto } from '@/data/scans';
import { confirm } from '@/lib/confirm';
import { dueText, formatDate } from '@/lib/format';
import { space, useTheme } from '@/theme';

const STATUS_OPTIONS: { value: ReadingStatus; label: string }[] = [
  { value: 'to_read', label: 'Okunacak' },
  { value: 'reading', label: 'Okunuyor' },
  { value: 'read', label: 'Okundu' },
  { value: 'abandoned', label: 'Yarıda' },
];

const ADDED_VIA_LABELS = { barcode: 'Barkodla', shelf: 'Raf taramasıyla', manual: 'Elle' } as const;

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const toast = useToast();
  const item = useDbQuery(() => getLibraryItem(id), [id], ['user_books', 'books', 'locations', 'loans']);
  const [picker, setPicker] = useState(false);
  const [lending, setLending] = useState(false);

  if (!item || item.userBook.deletedAt) {
    return (
      <EmptyState icon="book-outline" title="Kitap bulunamadı" body="Bu kitap kütüphaneden çıkarılmış olabilir." />
    );
  }

  const { book, userBook, authors, locationPath, activeLoan } = item;
  const pendingIsbn = book.syncState === 'pending_isbn';
  const loan = activeLoan?.dueAt ? dueText(activeLoan.dueAt) : null;
  const details = [book.publisher, book.year, book.pageCount ? `${book.pageCount} sayfa` : null]
    .filter(Boolean)
    .join(' · ');

  const takeCover = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const result = perm.granted
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [2, 3], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [2, 3], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const uri = await preparePhoto(asset.uri, asset.width, asset.height);
    setLocalCover(book.id, uri);
    toast('Kapak eklendi');
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Kütüphaneden çıkarılsın mı?',
      message: `“${book.title}” listenden kaldırılacak.`,
      confirmLabel: 'Çıkar',
      destructive: true,
    });
    if (!ok) return;
    await removeFromLibrary(userBook.id);
    router.back();
    toast('Kitap kütüphaneden çıkarıldı');
  };

  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
        <View style={styles.hero}>
          <BookCover uri={book.localCoverUri ?? book.coverUrl} title={book.title} width={112} pending={pendingIsbn} />
          <View style={{ flex: 1, gap: space.xs }}>
            <AppText variant="title" selectable>
              {pendingIsbn ? 'Bilgisi bekleniyor' : book.title}
            </AppText>
            <AppText muted selectable>
              {pendingIsbn ? `ISBN ${book.isbn13}` : authors.join(', ') || 'Yazar bilinmiyor'}
            </AppText>
            {details ? (
              <AppText variant="small" faint>
                {details}
              </AppText>
            ) : null}
            {book.source === 'manual' && !book.verified && !pendingIsbn ? (
              <AppText variant="small" faint>
                Elle eklendi
              </AppText>
            ) : null}
          </View>
        </View>

        {pendingIsbn ? (
          <View style={[styles.notice, { backgroundColor: c.bgSunken }]}>
            <AppText>İnternet gelince kapak ve bilgiler kendiliğinden dolacak.</AppText>
            <AppText variant="small" muted>
              Kitap hiçbir kaynakta bulunamazsa bilgileri sen girebilirsin.
            </AppText>
            <Button
              title="Bilgileri elle gir"
              kind="secondary"
              compact
              style={{ alignSelf: 'flex-start', marginTop: space.sm }}
              onPress={() =>
                router.push({ pathname: '/book/add', params: { complete: book.id, isbn: book.isbn13 ?? '' } })
              }
            />
          </View>
        ) : null}

        <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
          <Segmented
            options={STATUS_OPTIONS}
            value={userBook.status}
            onChange={(status) => updateUserBook(userBook.id, { status })}
          />
        </View>

        <SectionLabel>Nerede</SectionLabel>
        <Divider />
        <Row icon="location-outline" title="Konum" value={locationPath ?? 'Seç'} onPress={() => setPicker(true)} />
        <Divider inset={space.lg + 28 + space.md} />
        {activeLoan ? (
          <Row
            icon="swap-horizontal"
            title={`${activeLoan.borrowerName}’de`}
            subtitle={
              loan
                ? `${formatDate(activeLoan.dueAt)} · ${loan.text}`
                : `${formatDate(activeLoan.lentAt)} tarihinde verildi`
            }
            right={
              <Button
                title="Geri geldi"
                compact
                kind="secondary"
                onPress={async () => {
                  await returnLoan(activeLoan.id);
                  toast('İade kaydedildi');
                }}
              />
            }
          />
        ) : (
          <Row icon="swap-horizontal" title="Ödünç ver" onPress={() => setLending(true)} />
        )}
        <Divider />
        {loan?.overdue ? (
          <AppText variant="small" color={c.accent} style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
            İade tarihi geçti.
          </AppText>
        ) : null}

        <SectionLabel>Ayrıntılar</SectionLabel>
        <Divider />
        {!book.localCoverUri && !book.coverUrl ? (
          <>
            <Row icon="camera-outline" title="Kapak fotoğrafı ekle" onPress={takeCover} />
            <Divider inset={space.lg + 28 + space.md} />
          </>
        ) : null}
        {book.isbn13 ? (
          <>
            <Row icon="barcode-outline" title="ISBN" value={book.isbn13} />
            <Divider inset={space.lg + 28 + space.md} />
          </>
        ) : null}
        <Row
          icon="calendar-outline"
          title="Eklendi"
          subtitle={ADDED_VIA_LABELS[userBook.addedVia]}
          value={formatDate(userBook.createdAt, true)}
        />
        <Divider />

        <View style={{ paddingHorizontal: space.lg, paddingTop: space.xl }}>
          <Button title="Kütüphaneden çıkar" kind="danger" icon="trash-outline" onPress={remove} />
        </View>
      </ScrollView>

      <LocationPicker
        visible={picker}
        value={userBook.locationId}
        onClose={() => setPicker(false)}
        onSelect={(locationId, path) => {
          updateUserBook(userBook.id, { locationId });
          setPicker(false);
          toast(path ? `Konum: ${path}` : 'Konum kaldırıldı');
        }}
      />
      <LendSheet
        visible={lending}
        onClose={() => setLending(false)}
        userBookId={userBook.id}
        bookTitle={book.title}
        onDone={(borrower) => {
          setLending(false);
          toast(`${borrower} adına kaydedildi`);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    alignItems: 'flex-end',
  },
  notice: { marginHorizontal: space.lg, marginTop: space.lg, padding: space.lg, borderRadius: 10, gap: space.xs },
});
