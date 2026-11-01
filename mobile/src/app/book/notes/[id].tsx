import type { NoteKind } from '@kitaplik/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackLink } from '@/components/BackLink';
import { NoteItem } from '@/components/NoteItem';
import { NoteSheet } from '@/components/NoteSheet';
import { AppText, Chip, Divider, EmptyState, LinkButton } from '@/components/ui';
import { useDbQuery } from '@/db/changes';
import type { NoteRow } from '@/db/schema';
import { getLibraryItem } from '@/data/library';
import { noteCounts, notesForBook } from '@/data/notes';
import { getKv, setKv } from '@/data/kv';
import { space, useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';

/** Bir kitabın tüm alıntı ve notları; türe göre süzülür, sayfaya ya da tarihe göre sıralanır. */
export default function BookNotesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const item = useDbQuery(() => getLibraryItem(id), [id], ['user_books', 'books']);
  const [kind, setKind] = useState<NoteKind | null>(null);
  const [byPage, setByPage] = useState(() => getKv('notes.byPage') !== '0');
  const list = useDbQuery(() => notesForBook(id, { kind, byPage }), [id, kind, byPage], ['notes']);
  const counts = useDbQuery(() => noteCounts(id), [id], ['notes']);
  const [sheet, setSheet] = useState<{ kind: NoteKind; editing: NoteRow | null } | null>(null);

  if (!item) return <EmptyState icon="book-outline" title="Kitap bulunamadı" />;
  const title = item.book.title;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: '',
          headerLeft: () => <BackLink label={title.length > 22 ? `${title.slice(0, 20)}…` : title} />,
        }}
      />
      <FlatList
        data={list}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 120 }}
        ItemSeparatorComponent={Divider}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingBottom: space.md }}>
            <View>
              <AppText variant="heading">Notlar ve alıntılar</AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <AppText variant="secondary" muted style={{ flex: 1 }} numberOfLines={1}>
                  {`${title} · ${counts.quote} alıntı · ${counts.note} not`}
                </AppText>
                <LinkButton
                  title={byPage ? 'Sayfaya göre' : 'En yeni'}
                  onPress={() => {
                    setKv('notes.byPage', byPage ? '0' : '1');
                    setByPage(!byPage);
                  }}
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Chip label="Tümü" selected={kind === null} onPress={() => setKind(null)} />
              <Chip
                label="Alıntılar"
                count={counts.quote}
                selected={kind === 'quote'}
                onPress={() => setKind('quote')}
              />
              <Chip label="Notlar" count={counts.note} selected={kind === 'note'} onPress={() => setKind('note')} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="bookmark-outline"
            title="Henüz kayıt yok"
            body="Altını çizdiğin cümleleri sayfa numarasıyla sakla; notlarını da buraya yaz."
          />
        }
        renderItem={({ item: note }) => (
          <NoteItem note={note} showDate onPress={() => setSheet({ kind: note.kind, editing: note })} />
        )}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Alıntı ya da not ekle"
        onPress={() => setSheet({ kind: kind ?? 'quote', editing: null })}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: c.primary, bottom: insets.bottom + space.lg, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Ionicons name="add" size={22} color={c.primaryText} />
        <AppText color={c.primaryText} style={{ fontWeight: '600' }}>
          Ekle
        </AppText>
      </Pressable>
      {sheet ? (
        <NoteSheet
          visible
          onClose={() => setSheet(null)}
          userBookId={id}
          bookTitle={title}
          initialKind={sheet?.kind}
          editing={sheet?.editing}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: space.lg,
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
});
