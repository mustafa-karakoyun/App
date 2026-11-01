import { router, Stack } from 'expo-router';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { BackLink } from '@/components/BackLink';
import { AppText, EmptyState, SectionLabel } from '@/components/ui';
import { useDbQuery } from '@/db/changes';
import { returnedLoans } from '@/data/loans';
import { dative, formatShort, monthYear } from '@/lib/format';
import { space, useTheme } from '@/theme';

/** İade edilen ödünçler, aya göre gruplu. */
export default function LoanHistoryScreen() {
  const { c } = useTheme();
  const loans = useDbQuery(() => returnedLoans(500), [], ['loans', 'books']);
  const sections: { title: string; data: typeof loans }[] = [];
  for (const l of loans) {
    const title = monthYear(l.loan.returnedAt!);
    const last = sections[sections.length - 1];
    if (last?.title === title) last.data.push(l);
    else sections.push({ title, data: [l] });
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerLeft: () => <BackLink label="Ödünçte" /> }} />
      <SectionList
        sections={sections}
        keyExtractor={(l) => l.loan.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        ListEmptyComponent={<EmptyState icon="swap-horizontal-outline" title="Henüz iade edilen kitap yok" />}
        renderSectionHeader={({ section }) => <SectionLabel>{section.title}</SectionLabel>}
        renderItem={({ item, index, section }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.userBookId, from: 'loans' } })}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
          >
            <View
              style={[
                styles.inner,
                {
                  borderBottomColor: c.hairline,
                  borderBottomWidth: index === section.data.length - 1 ? 0 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="bookTitle" numberOfLines={1}>
                  {item.book.title}
                </AppText>
                <AppText variant="small" muted>{`${dative(item.loan.borrowerName)} verildi`}</AppText>
              </View>
              <AppText variant="small" faint>{`${formatShort(item.loan.returnedAt)} geri geldi`}</AppText>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingLeft: space.lg },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingRight: space.lg,
    minHeight: 58,
  },
});
