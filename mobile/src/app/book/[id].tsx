import { Ionicons } from '@expo/vector-icons';
import type { NoteKind, ReadingStatus } from '@kitaplik/shared';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { BookCover } from '@/components/BookCover';
import { LendSheet } from '@/components/LendSheet';
import { LocationPicker } from '@/components/LocationPicker';
import { NoteItem } from '@/components/NoteItem';
import { NoteSheet } from '@/components/NoteSheet';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import {
  AppText,
  Divider,
  EmptyState,
  IconButton,
  LinkButton,
  Notice,
  PillButton,
  Row,
  SectionLabel,
  Segmented,
} from '@/components/ui';
import { useDbQuery } from '@/db/changes';
import type { NoteRow } from '@/db/schema';
import { getLibraryItem, removeFromLibrary, setLocalCover, updateUserBook } from '@/data/library';
import { returnLoan, undoReturn } from '@/data/loans';
import { noteCounts, notesForBook } from '@/data/notes';
import { preparePhoto } from '@/data/scans';
import { confirm } from '@/lib/confirm';
import { dueText, formatIsbn, formatShort, locative, untilText } from '@/lib/format';
import { goBack } from '@/lib/nav';
import { BackLink } from '@/components/BackLink';
import { space, useTheme } from '@/theme';

const STATUS_OPTIONS: { value: ReadingStatus; label: string }[] = [
  { value: 'to_read', label: 'Okunacak' },
  { value: 'reading', label: 'Okunuyor' },
  { value: 'read', label: 'Okundu' },
  { value: 'abandoned', label: 'Yarıda' },
];

const ADDED_VIA_LABELS = { barcode: 'Barkodla', shelf: 'Raf taramasıyla', manual: 'Elle' } as const;
const INSET = space.lg + 22 + space.md;

export default function BookScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { c } = useTheme();
  const toast = useToast();
  const item = useDbQuery(() => getLibraryItem(id), [id], ['user_books', 'books', 'locations', 'loans']);
  const notes = useDbQuery(() => notesForBook(id).slice(0, 2), [id], ['notes']);
  const counts = useDbQuery(() => noteCounts(id), [id], ['notes']);
  const [picker, setPicker] = useState(false);
  const [lending, setLending] = useState(false);
  const [menu, setMenu] = useState(false);
  const [noteSheet, setNoteSheet] = useState<{ kind: NoteKind; editing: NoteRow | null } | null>(null);

  if (!item || item.userBook.deletedAt) {
    return (
      <EmptyState icon="book-outline" title="Kitap bulunamadı" body="Bu kitap kütüphaneden çıkarılmış olabilir." />
    );
  }

  const { book, userBook, authors, locationPath, activeLoan } = item;
  const pendingIsbn = book.syncState === 'pending_isbn';
  const hasCover = !!(book.localCoverUri || book.coverUrl);

  const takeCover = async () => {
    setMenu(false);
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
    setMenu(false);
    const ok = await confirm({
      title: 'Kütüphaneden çıkarılsın mı?',
      message: `“${book.title}” ve okuma durumu, konumu, ödünç geçmişi bu cihazdan ve yedekten silinir.`,
      confirmLabel: 'Çıkar',
      destructive: true,
    });
    if (!ok) return;
    await removeFromLibrary(userBook.id);
    goBack();
    toast('Kitap kütüphaneden çıkarıldı');
  };

  const loanRow = () => {
    if (!activeLoan) {
      return <Row icon="swap-horizontal" iconColor={c.text} title="Ödünç ver" onPress={() => setLending(true)} />;
    }
    const due = activeLoan.dueAt ? dueText(activeLoan.dueAt) : null;
    const tone = due?.overdue ? c.accent : c.warning;
    const subtitle = due
      ? due.overdue
        ? `İade tarihi geçti · ${due.text}`
        : `${untilText(activeLoan.dueAt!)} · ${due.text}`
      : `${formatShort(activeLoan.lentAt)} tarihinden beri · tarihsiz`;
    return (
      <Row
        icon="swap-horizontal"
        iconColor={tone}
        title={locative(activeLoan.borrowerName)}
        strong
        subtitle={subtitle}
        subtitleColor={tone}
        right={
          <PillButton
            title="Geri geldi"
            strong
            onPress={async () => {
              await returnLoan(activeLoan.id);
              toast({
                message: 'İade kaydedildi',
                actionLabel: 'Geri al',
                onAction: () => void undoReturn(activeLoan.id),
              });
            }}
          />
        }
      />
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerLeft: () => (
            <BackLink label={from === 'loans' ? 'Ödünçte' : from === 'notes' ? 'Alıntılar' : 'Kütüphane'} />
          ),
          headerRight: () => (
            <IconButton
              icon="ellipsis-horizontal"
              label="Diğer işlemler"
              onPress={() => setMenu(true)}
              color={c.textMuted}
            />
          ),
        }}
      />
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
        <View style={styles.hero}>
          <BookCover uri={book.localCoverUri ?? book.coverUrl} title={book.title} width={112} pending={pendingIsbn} />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="detailTitle" selectable muted={pendingIsbn}>
              {pendingIsbn ? 'Bilgisi bekleniyor' : book.title}
            </AppText>
            <AppText variant="sub" muted selectable>
              {pendingIsbn ? 'Başlık henüz yok' : authors.join(', ') || 'Yazar bilinmiyor'}
            </AppText>
            {pendingIsbn ? (
              <AppText variant="small" faint>
                {`ISBN ${formatIsbn(book.isbn13)}\n${ADDED_VIA_LABELS[userBook.addedVia]} eklendi`}
              </AppText>
            ) : (
              <>
                {book.publisher ? (
                  <AppText variant="small" faint>
                    {book.publisher}
                  </AppText>
                ) : null}
                {book.year || book.pageCount ? (
                  <AppText variant="small" faint>
                    {[book.year, book.pageCount ? `${book.pageCount} sayfa` : null].filter(Boolean).join(' · ')}
                  </AppText>
                ) : null}
                {book.syncState === 'pending_manual' ? (
                  <AppText variant="small" faint>
                    Elle eklendi
                  </AppText>
                ) : null}
              </>
            )}
          </View>
        </View>

        {pendingIsbn ? (
          <Notice
            icon="time-outline"
            style={{ marginHorizontal: space.lg, marginTop: space.lg }}
            action={
              <LinkButton
                title="Bilgileri elle gir ›"
                color={c.text}
                onPress={() =>
                  router.push({ pathname: '/book/add', params: { complete: book.id, isbn: book.isbn13 ?? '' } })
                }
              />
            }
          >
            İnternet gelince kapak ve bilgiler kendiliğinden dolacak. Hiçbir kaynakta bulunamazsa bilgileri sen
            girebilirsin.
          </Notice>
        ) : null}

        <SectionLabel>Okuma durumu</SectionLabel>
        <View style={{ paddingHorizontal: space.lg }}>
          <Segmented
            options={STATUS_OPTIONS}
            value={userBook.status}
            onChange={(status) => updateUserBook(userBook.id, { status })}
          />
        </View>

        <SectionLabel
          right={
            counts.quote + counts.note > 0 ? (
              <AppText variant="small" muted style={{ fontSize: 12, fontWeight: '600' }}>
                {[counts.quote ? `${counts.quote} alıntı` : null, counts.note ? `${counts.note} not` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
            ) : null
          }
        >
          Notlar ve alıntılar
        </SectionLabel>
        <View style={{ paddingHorizontal: space.lg }}>
          {notes.length ? (
            notes.map((n) => (
              <View key={n.id}>
                <NoteItem note={n} lines={4} onPress={() => setNoteSheet({ kind: n.kind, editing: n })} />
                <Divider />
              </View>
            ))
          ) : (
            <>
              <View style={styles.notesEmpty}>
                <Ionicons name="book-outline" size={20} color={c.textMuted} />
                <AppText variant="secondary" muted style={{ flex: 1 }}>
                  Altını çizdiğin bir cümle mi var? Sayfa numarasıyla sakla.
                </AppText>
              </View>
              <Divider />
            </>
          )}
          <View style={styles.notePills}>
            <PillButton
              title="Alıntı ekle"
              icon="add"
              strong
              onPress={() => setNoteSheet({ kind: 'quote', editing: null })}
            />
            <PillButton
              title="Not ekle"
              icon="pencil-outline"
              onPress={() => setNoteSheet({ kind: 'note', editing: null })}
            />
            <View style={{ flex: 1 }} />
            {notes.length ? (
              <LinkButton title="Tümü ›" onPress={() => router.push(`/book/notes/${userBook.id}`)} />
            ) : null}
          </View>
        </View>

        <SectionLabel>Nerede</SectionLabel>
        <Row
          icon="location-outline"
          iconColor={c.text}
          title="Konum"
          value={locationPath ?? 'Seç'}
          onPress={() => setPicker(true)}
        />
        <Divider inset={INSET} />
        {loanRow()}

        <SectionLabel>Ayrıntılar</SectionLabel>
        <Row
          icon="camera-outline"
          iconColor={c.text}
          title={hasCover ? 'Kapak fotoğrafını değiştir' : 'Kapak fotoğrafı ekle'}
          onPress={takeCover}
        />
        <Divider inset={INSET} />
        {book.isbn13 ? (
          <>
            <Row icon="barcode-outline" iconColor={c.text} title="ISBN" value={formatIsbn(book.isbn13)} />
            <Divider inset={INSET} />
          </>
        ) : null}
        <Row
          icon="time-outline"
          iconColor={c.text}
          title="Eklendi"
          value={`${formatShort(userBook.createdAt)} · ${ADDED_VIA_LABELS[userBook.addedVia]}`}
        />
        <Divider />

        <View style={{ paddingHorizontal: space.lg, paddingTop: space.xl }}>
          <LinkButton title="Kütüphaneden çıkar" color={c.accent} onPress={remove} />
        </View>
      </ScrollView>

      <LocationPicker
        visible={picker}
        value={userBook.locationId}
        subtitle={book.title}
        onClose={() => setPicker(false)}
        onSelect={(locationId, path) => {
          const previous = userBook.locationId;
          updateUserBook(userBook.id, { locationId });
          setPicker(false);
          toast({
            message: path ? `Konum: ${path}` : 'Konum kaldırıldı',
            actionLabel: 'Geri al',
            onAction: () => updateUserBook(userBook.id, { locationId: previous }),
          });
        }}
      />
      <LendSheet
        visible={lending}
        onClose={() => setLending(false)}
        userBookId={userBook.id}
        bookTitle={book.title}
        onDone={(borrower) => {
          setLending(false);
          toast(`Ödünç verildi: ${borrower}`);
        }}
      />
      {noteSheet ? (
        <NoteSheet
          visible
          onClose={() => setNoteSheet(null)}
          userBookId={userBook.id}
          bookTitle={book.title}
          initialKind={noteSheet?.kind}
          editing={noteSheet?.editing}
        />
      ) : null}
      <Sheet visible={menu} onClose={() => setMenu(false)} title={book.title}>
        <Row
          icon="camera-outline"
          title={hasCover ? 'Kapak fotoğrafını değiştir' : 'Kapak fotoğrafı ekle'}
          onPress={takeCover}
          chevron={false}
        />
        <Divider inset={INSET} />
        {!activeLoan ? (
          <>
            <Row
              icon="swap-horizontal"
              title="Ödünç ver"
              onPress={() => {
                setMenu(false);
                setLending(true);
              }}
              chevron={false}
            />
            <Divider inset={INSET} />
          </>
        ) : null}
        {book.syncState === 'pending_manual' ? (
          <>
            <Row
              icon="create-outline"
              title="Bilgileri düzenle"
              onPress={() => {
                setMenu(false);
                router.push({ pathname: '/book/add', params: { complete: book.id, isbn: book.isbn13 ?? '' } });
              }}
              chevron={false}
            />
            <Divider inset={INSET} />
          </>
        ) : null}
        <Row icon="trash-outline" title="Kütüphaneden çıkar" danger onPress={remove} chevron={false} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    alignItems: 'flex-start',
  },
  notesEmpty: { flexDirection: 'row', gap: space.md, paddingVertical: space.md },
  notePills: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md },
});
