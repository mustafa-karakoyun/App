import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookCover } from '@/components/BookCover';
import { useToast } from '@/components/Toast';
import { AppText, EmptyState, LinkButton, PillButton, SectionLabel } from '@/components/ui';
import { useDbQuery } from '@/db/changes';
import { activeLoans, returnedLoans, returnLoan, undoReturn, type LoanItem } from '@/data/loans';
import { dueText, formatDate, wasText } from '@/lib/format';
import { serif, space, useTheme } from '@/theme';

/** Kimde ne var: iade tarihi geçenler en üstte, kişi adı en belirgin. */
export default function LoansScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const active = useDbQuery(() => activeLoans(), [], ['loans', 'user_books', 'books']);
  const returnedCount = useDbQuery(() => returnedLoans(500).length, [], ['loans']);

  const overdue = active.filter((l) => l.loan.dueAt && dueText(l.loan.dueAt).overdue);
  const current = active.filter((l) => !overdue.includes(l));
  const historyLink = (
    <LinkButton
      title={returnedCount ? `İade edilenleri göster (${returnedCount})` : 'İade edilenleri göster'}
      onPress={() => router.push('/loans-history')}
    />
  );

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: 60, flexGrow: 1 }}
    >
      <View style={{ paddingHorizontal: space.lg }}>
        <AppText variant="display">Ödünçte</AppText>
        <AppText variant="sub" muted>
          {active.length
            ? `${active.length} kitap başkasında${overdue.length ? ` · ${overdue.length} gecikti` : ''}`
            : 'Tüm kitapların evde'}
        </AppText>
      </View>

      {active.length === 0 ? (
        <EmptyState
          icon="swap-horizontal-outline"
          title="Ödünçte kitap yok"
          body="Bir kitabı ödünç verirken kitabın sayfasından “Ödünç ver”e dokun; iade günü sana hatırlatalım."
          action={returnedCount ? historyLink : undefined}
        />
      ) : null}

      {overdue.length ? (
        <>
          <SectionLabel
            color={c.accent}
            style={{ paddingTop: space.md }}
          >{`İadesi gecikenler · ${overdue.length}`}</SectionLabel>
          {overdue.map((l, i) => (
            <LoanRow key={l.loan.id} item={l} last={i === overdue.length - 1} />
          ))}
        </>
      ) : null}
      {current.length ? (
        <>
          <SectionLabel
            style={overdue.length ? undefined : { paddingTop: space.md }}
          >{`Ödünçte · ${current.length}`}</SectionLabel>
          {current.map((l, i) => (
            <LoanRow key={l.loan.id} item={l} last={i === current.length - 1} />
          ))}
        </>
      ) : null}

      {active.length ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/loans-history')} style={styles.history}>
          <AppText color={c.primary} style={{ fontWeight: '600', fontSize: 15 }}>
            İade edilenleri göster
          </AppText>
          <Ionicons name="chevron-down" size={18} color={c.primary} />
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function LoanRow({ item, last }: { item: LoanItem; last: boolean }) {
  const { c } = useTheme();
  const toast = useToast();
  const { loan, book } = item;
  const due = loan.dueAt ? dueText(loan.dueAt) : null;
  const tone = due?.overdue ? c.accent : due ? c.warning : c.textMuted;
  const when = due
    ? due.overdue
      ? `${due.text} · ${wasText(loan.dueAt!)}`
      : `${formatDate(loan.dueAt)} · ${due.text}`
    : `${formatDate(loan.lentAt)} tarihinden beri · tarihsiz`;
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.rowMain,
          { borderBottomColor: c.hairline, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.userBookId, from: 'loans' } })}
          style={({ pressed }) => [styles.rowTap, { opacity: pressed ? 0.6 : 1 }]}
        >
          <BookCover uri={book.localCoverUri ?? book.coverUrl} title={book.title} width={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText style={{ fontSize: 17, lineHeight: 22, fontWeight: '700' }}>{loan.borrowerName}</AppText>
            <AppText muted numberOfLines={1} style={{ fontFamily: serif, fontSize: 15, lineHeight: 20 }}>
              {book.title}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name={due?.overdue ? 'alert-circle-outline' : 'time-outline'} size={15} color={tone} />
              <AppText
                variant="small"
                color={tone}
                style={{ fontWeight: due?.overdue ? '700' : '400', flexShrink: 1 }}
                numberOfLines={1}
              >
                {when}
              </AppText>
            </View>
          </View>
        </Pressable>
        <PillButton
          title="Geri geldi"
          strong
          onPress={async () => {
            await returnLoan(loan.id);
            toast({
              message: `İade kaydedildi · ${book.title}`,
              actionLabel: 'Geri al',
              onAction: () => void undoReturn(loan.id),
            });
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingLeft: space.lg },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingRight: space.lg, minHeight: 96 },
  rowTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  history: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    minHeight: 44,
  },
});
