import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookCover } from '@/components/BookCover';
import { useToast } from '@/components/Toast';
import { AppText, Button, Divider, EmptyState, SectionLabel } from '@/components/ui';
import { useDbQuery } from '@/db/changes';
import { activeLoans, returnedLoans, returnLoan, type LoanItem } from '@/data/loans';
import { dueText, formatDate } from '@/lib/format';
import { space, useTheme } from '@/theme';

/** Kimde ne var: iade tarihi geçenler en üstte. */
export default function LoansScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const active = useDbQuery(() => activeLoans(), [], ['loans', 'user_books', 'books']);
  const [showHistory, setShowHistory] = useState(false);
  const history = useDbQuery(() => (showHistory ? returnedLoans() : []), [showHistory], ['loans']);

  const overdue = active.filter((l) => l.loan.dueAt && dueText(l.loan.dueAt).overdue);
  const current = active.filter((l) => !overdue.includes(l));

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xxl }}>
      <View style={{ paddingHorizontal: space.lg }}>
        <AppText variant="display">Ödünçte</AppText>
        <AppText muted>{active.length ? `${active.length} kitap başkasında` : 'Tüm kitapların evde'}</AppText>
      </View>

      {active.length === 0 ? (
        <EmptyState
          icon="swap-horizontal-outline"
          title="Ödünçte kitap yok"
          body="Bir kitabı ödünç verirken kitabın sayfasından “Ödünç ver”e dokun; iade günü sana hatırlatalım."
        />
      ) : null}

      {overdue.length ? (
        <>
          <SectionLabel>
            <AppText variant="overline" color={c.accent}>
              İadesi gecikenler
            </AppText>
          </SectionLabel>
          <Divider />
          {overdue.map((l) => (
            <LoanRow key={l.loan.id} item={l} />
          ))}
        </>
      ) : null}
      {current.length ? (
        <>
          <SectionLabel>Ödünçte</SectionLabel>
          <Divider />
          {current.map((l) => (
            <LoanRow key={l.loan.id} item={l} />
          ))}
        </>
      ) : null}

      <View style={{ padding: space.lg }}>
        <Button
          title={showHistory ? 'Geçmişi gizle' : 'İade edilenleri göster'}
          kind="ghost"
          compact
          onPress={() => setShowHistory((s) => !s)}
        />
      </View>
      {showHistory ? (
        history.length ? (
          <>
            <Divider />
            {history.map((h) => (
              <View key={h.loan.id}>
                <Pressable onPress={() => router.push(`/book/${h.userBookId}`)} style={styles.historyRow}>
                  <AppText numberOfLines={1} style={{ flex: 1 }}>
                    {h.book.title}
                  </AppText>
                  <AppText variant="small" muted>
                    {h.loan.borrowerName} · {formatDate(h.loan.returnedAt)}
                  </AppText>
                </Pressable>
                <Divider inset={space.lg} />
              </View>
            ))}
          </>
        ) : (
          <AppText muted style={{ paddingHorizontal: space.lg }}>
            Henüz iade edilen kitap yok.
          </AppText>
        )
      ) : null}
    </ScrollView>
  );
}

function LoanRow({ item }: { item: LoanItem }) {
  const { c } = useTheme();
  const toast = useToast();
  const { loan, book } = item;
  const due = loan.dueAt ? dueText(loan.dueAt) : null;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/book/${item.userBookId}`)}
        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.bgSunken : 'transparent' }]}
      >
        <BookCover uri={book.localCoverUri ?? book.coverUrl} title={book.title} width={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" style={{ fontSize: 16 }}>
            {loan.borrowerName}
          </AppText>
          <AppText muted numberOfLines={1}>
            {book.title}
          </AppText>
          <AppText variant="small" color={due?.overdue ? c.accent : c.textFaint}>
            {due ? `${formatDate(loan.dueAt)} · ${due.text}` : `${formatDate(loan.lentAt)} tarihinden beri`}
          </AppText>
        </View>
        <Button
          title="Geri geldi"
          kind="secondary"
          compact
          onPress={async () => {
            await returnLoan(loan.id);
            toast(`“${book.title}” geri geldi`);
          }}
        />
      </Pressable>
      <Divider inset={space.lg + 44 + space.md} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 48 },
});
