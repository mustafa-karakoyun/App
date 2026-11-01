import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { BackLink } from '@/components/BackLink';
import { BookCover } from '@/components/BookCover';
import { NoteItem } from '@/components/NoteItem';
import { AppText, Divider, EmptyState } from '@/components/ui';
import { useDbQuery } from '@/db/changes';
import { notesByBook } from '@/data/notes';
import { radius, space, useTheme } from '@/theme';

/** Profil › Alıntılar ve notlar: tüm kitaplardaki kayıtlar, kitap başına grup. */
export default function AllNotesScreen() {
  const { c } = useTheme();
  const [query, setQuery] = useState('');
  const { groups, total } = useDbQuery(() => notesByBook(query), [query], ['notes', 'user_books', 'books']);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: '', headerLeft: () => <BackLink label="Profil" /> }} />
      <FlatList
        data={groups}
        keyExtractor={(g) => g.userBookId}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 60 }}
        ItemSeparatorComponent={Divider}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: space.lg, gap: space.md, paddingBottom: space.md }}>
            <View>
              <AppText variant="heading">Alıntılar ve notlar</AppText>
              <AppText variant="secondary" muted>
                {query ? `${total} sonuç` : `${groups.length} kitapta ${total} kayıt`}
              </AppText>
            </View>
            <View style={[styles.search, { backgroundColor: c.bgSunken }]}>
              <Ionicons name="search" size={22} color={c.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Alıntılarda ara"
                placeholderTextColor={c.textFaint}
                style={{ flex: 1, fontSize: 16, color: c.text, paddingVertical: space.sm }}
                accessibilityLabel="Alıntılarda ara"
                autoCorrect={false}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="bookmark-outline"
            title={query ? 'Eşleşen kayıt yok' : 'Henüz alıntı yok'}
            body={
              query ? undefined : 'Bir kitabın sayfasında “Alıntı ekle”ye dokunarak altını çizdiğin cümleleri sakla.'
            }
          />
        }
        renderItem={({ item: g }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/book/notes/${g.userBookId}`)}
            style={({ pressed }) => [styles.group, { backgroundColor: pressed ? c.bgSunken : 'transparent' }]}
          >
            <View style={styles.groupHead}>
              <BookCover uri={g.book.localCoverUri ?? g.book.coverUrl} title={g.book.title} width={30} />
              <View style={{ flex: 1 }}>
                <AppText variant="bookTitle" numberOfLines={1}>
                  {g.book.title}
                </AppText>
                <AppText variant="small" muted numberOfLines={1}>
                  {[g.authors.join(', '), `${g.count} kayıt`].filter(Boolean).join(' · ')}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
            </View>
            <View style={{ paddingLeft: 42 }}>
              <NoteItem note={g.latest} lines={3} />
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.md,
    borderRadius: radius.md,
    minHeight: 44,
  },
  group: { paddingHorizontal: space.lg, paddingTop: space.md },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
