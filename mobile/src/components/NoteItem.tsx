import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import type { NoteRow } from '@/db/schema';
import { formatShort, relativeTime } from '@/lib/format';
import { space, useTheme } from '@/theme';
import { AppText } from './ui';

/**
 * Alıntı: solda yeşil çizgi, serif italik metin, altında sayfa. Not: kalem simgesi
 * ve düz metin. `source` verilirse (aramada, profilde) kitap adı da yazılır.
 */
export function NoteItem({
  note,
  onPress,
  source,
  showDate,
  lines,
}: {
  note: NoteRow;
  onPress?: () => void;
  source?: string;
  showDate?: boolean;
  lines?: number;
}) {
  const { c } = useTheme();
  const meta = [
    source,
    note.kind === 'note' ? 'Not' : null,
    note.page != null ? `s. ${note.page}` : null,
    showDate ? formatShort(note.createdAt) : note.kind === 'note' ? relativeTime(note.createdAt) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? 'Düzenle' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      {note.kind === 'quote' ? (
        <View style={[styles.bar, { backgroundColor: c.primary }]} />
      ) : (
        <Ionicons name="pencil-outline" size={16} color={c.textMuted} style={{ marginTop: 3 }} />
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant={note.kind === 'quote' ? 'quote' : 'sub'} numberOfLines={lines}>
          {note.text}
        </AppText>
        {meta ? (
          <AppText variant="small" faint style={{ fontSize: 12 }}>
            {meta}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, paddingVertical: space.md },
  bar: { width: 2.5, borderRadius: 1.25, alignSelf: 'stretch' },
});
