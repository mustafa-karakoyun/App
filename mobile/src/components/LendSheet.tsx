import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { lendBook, recentBorrowers } from '@/data/loans';
import { formatDate } from '@/lib/format';
import { space } from '@/theme';
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

/** Ödünç verme: isim + iade süresi, iki dokunuş. Ad yalnızca cihazda ve kullanıcının yedeğinde tutulur. */
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Ödünç ver"
      footer={<Button title="Kaydet" onPress={save} loading={saving} disabled={!name.trim()} />}
    >
      <View style={{ paddingHorizontal: space.lg, gap: space.lg, paddingBottom: space.sm }}>
        <AppText muted numberOfLines={2}>
          “{bookTitle}”
        </AppText>
        <TextField
          label="Kime?"
          placeholder="Ad"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={save}
        />
        {recent.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {recent.map((r) => (
              <Chip key={r} label={r} selected={name === r} onPress={() => setName(r)} />
            ))}
          </ScrollView>
        ) : null}
        <View style={{ gap: space.sm }}>
          <AppText variant="label" muted>
            İade
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {DUE_OPTIONS.map((o) => (
              <Chip key={o.label} label={o.label} selected={days === o.days} onPress={() => setDays(o.days)} />
            ))}
          </View>
          <AppText variant="small" faint>
            {days === null ? 'Hatırlatma kurulmayacak.' : `${formatDate(addDays(days), true)} sabahı hatırlatacağız.`}
          </AppText>
        </View>
      </View>
    </Sheet>
  );
}
