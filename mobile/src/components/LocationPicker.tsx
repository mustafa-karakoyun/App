import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useDbQuery } from '@/db/changes';
import { createLocation, locationTree } from '@/data/locations';
import { space, useTheme } from '@/theme';
import { Sheet } from './Sheet';
import { AppText, Button, Divider, IconButton, LinkButton } from './ui';

/**
 * Konum seçici. Ağaç girintili listelenir; her satırdaki "+" o konumun içine yeni
 * konum açar ("Salon" → "2. raf"). Seçince kapanır.
 */
export function LocationPicker({
  visible,
  value,
  onClose,
  onSelect,
  title = 'Konum seç',
  subtitle,
  allowNone = true,
}: {
  subtitle?: string | null;
  visible: boolean;
  value: string | null;
  onClose: () => void;
  onSelect: (id: string | null, path: string | null) => void;
  title?: string;
  allowNone?: boolean;
}) {
  const { c } = useTheme();
  const tree = useDbQuery(() => locationTree(), [], ['locations']);
  const [draft, setDraft] = useState('');
  const [parent, setParent] = useState<{ id: string; path: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const close = () => {
    setAdding(false);
    setParent(null);
    setDraft('');
    onClose();
  };

  const submit = () => {
    const name = draft.trim();
    if (!name) return;
    const created = createLocation(name, parent?.id ?? null);
    const path = parent ? `${parent.path} / ${created.name}` : created.name;
    setDraft('');
    setAdding(false);
    setParent(null);
    onSelect(created.id, path);
  };

  const inlineForm = (
    <View style={[styles.inline, { backgroundColor: c.primarySoft }]}>
      <AppText variant="small" muted style={{ fontWeight: '600' }}>
        {parent ? `“${parent.path}” içine` : 'Yeni oda ya da alan'}
      </AppText>
      <TextInput
        autoFocus
        placeholder={parent ? 'ör. 2. raf' : 'ör. Salon'}
        placeholderTextColor={c.textFaint}
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={submit}
        returnKeyType="done"
        accessibilityLabel="Yeni konumun adı"
        style={[styles.inlineInput, { color: c.text, backgroundColor: c.surface, borderColor: c.primary }]}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space.md }}>
        <LinkButton title="Vazgeç" color={c.textMuted} onPress={() => setAdding(false)} />
        <Button title="Ekle ve seç" compact onPress={submit} disabled={!draft.trim()} style={styles.inlineButton} />
      </View>
    </View>
  );

  return (
    <Sheet visible={visible} onClose={close} title={title} subtitle={subtitle}>
      {allowNone ? (
        <>
          <Option label="Konumsuz" selected={value === null} onPress={() => onSelect(null, null)} depth={0} muted />
          <Divider inset={space.lg} />
        </>
      ) : null}
      {tree.length === 0 && !adding ? (
        <View style={{ padding: space.lg, gap: space.xs }}>
          <AppText muted>Henüz konum yok.</AppText>
          <AppText variant="small" faint>
            Oda, raf ve kutu gibi iç içe konumlar oluşturabilirsin: “Salon / 2. raf”.
          </AppText>
        </View>
      ) : null}
      {tree.map((node) => (
        <View key={node.id}>
          <Option
            label={node.name}
            depth={node.depth}
            selected={value === node.id}
            onPress={() => onSelect(node.id, node.path)}
            onAddChild={() => {
              setParent({ id: node.id, path: node.path });
              setDraft('');
              setAdding(true);
            }}
          />
          <Divider inset={space.lg + node.depth * 26} />
          {adding && parent?.id === node.id ? inlineForm : null}
        </View>
      ))}

      <View style={{ padding: space.lg }}>
        {adding && !parent ? (
          inlineForm
        ) : (
          <LinkButton
            title="Yeni konum"
            icon="add"
            onPress={() => {
              setParent(null);
              setDraft('');
              setAdding(true);
            }}
          />
        )}
      </View>
    </Sheet>
  );
}

function Option({
  label,
  depth,
  selected,
  onPress,
  onAddChild,
  muted,
}: {
  label: string;
  depth: number;
  selected: boolean;
  onPress: () => void;
  onAddChild?: () => void;
  muted?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.option, { paddingLeft: space.lg + depth * 26 }]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        onPress={onPress}
        style={({ pressed }) => [styles.optionMain, { opacity: pressed ? 0.6 : 1 }]}
      >
        {muted ? null : depth > 0 ? (
          <Ionicons name="return-down-forward" size={16} color={c.textFaint} />
        ) : (
          <Ionicons name="location-outline" size={22} color={c.textMuted} />
        )}
        <AppText style={{ flex: 1, fontWeight: depth === 0 && !muted ? '600' : '400' }} muted={muted}>
          {label}
        </AppText>
        {selected ? <Ionicons name="checkmark" size={22} color={c.primary} /> : null}
      </Pressable>
      {onAddChild ? (
        <IconButton icon="add" label={`${label} içine konum ekle`} onPress={onAddChild} color={c.text} size={24} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inline: { marginHorizontal: space.lg, marginVertical: space.sm, padding: space.md, borderRadius: 12, gap: space.sm },
  inlineInput: { height: 40, borderRadius: 10, borderWidth: 1.4, paddingHorizontal: space.md, fontSize: 16 },
  inlineButton: { minHeight: 40, borderRadius: 10, paddingHorizontal: space.lg },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingRight: space.sm },
  optionMain: { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
