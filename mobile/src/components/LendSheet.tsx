import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { lendBook, recentBorrowers } from '@/data/loans';
import { formatDate } from '@/lib/format';
import { space, useTheme } from '@/theme';
import { Sheet } from './Sheet';
import { AppText, Button, Chip, TextField } from './ui';

const DUE_OPTIONS = [
  { label: '1 hafta', days: 7 },
  { label: '2 hafta', days: 14 },
  { label: '1 ay', days: 30 },
  { label: '2 ay', days: 60 },
  { label: 'Tarihsiz', days: null },
] as const;

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

/** "İki dokunuşta ödünç": kişi çipi + Kaydet. Varsayılan iade 2 hafta. */
export function LendSheet({
  visible,
  onClose,
  userBookId,
  bookTitle,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  userBookId: string;
  bookTitle: string;
  onDone: (borrower: string) => void;
}) {
  const { c } = useTheme();
  const [name, setName] = useState('');
  const [days, setDays] = useState<number | null>(14);
  const [saving, setSaving] = useState(false);
  const recent = visible ? recentBorrowers() : [];

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await lendBook(userBookId, name, days === null ? null : addDays(days));
      onDone(name.trim());
      setName('');
      setDays(14);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Ödünç ver"
      subtitle={`“${bookTitle}”`}
      footer={<Button title="Kaydet" onPress={save} loading={saving} disabled={!name.trim()} />}
    >
      <View style={{ paddingHorizontal: space.lg, gap: space.md, paddingBottom: space.sm }}>
        <TextField
          label="Kime?"
          placeholder="Ad yaz"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={save}
          style={name ? { borderColor: c.primary, borderWidth: 1.6 } : undefined}
        />
        {recent.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {recent.map((r) => (
              <Chip key={r} label={r} filled selected={name === r} onPress={() => setName(r)} />
            ))}
          </ScrollView>
        ) : null}
        <AppText variant="overline" muted style={{ marginTop: space.md }}>
          İade
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {DUE_OPTIONS.map((o) => (
            <Chip key={o.label} label={o.label} selected={days === o.days} onPress={() => setDays(o.days)} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs }}>
          <Ionicons
            name={days === null ? 'notifications-off-outline' : 'notifications-outline'}
            size={18}
            color={c.textMuted}
          />
          <AppText variant="secondary" style={days === null ? { color: c.textMuted } : { fontWeight: '600' }}>
            {days === null ? 'Hatırlatma kurulmayacak.' : `${formatDate(addDays(days), true)} sabahı hatırlatacağız.`}
          </AppText>
        </View>
        <AppText variant="small" faint style={{ fontSize: 12 }}>
          Rehberine erişmiyoruz; yalnızca ad saklanır.
        </AppText>
      </View>
    </Sheet>
  );
}
