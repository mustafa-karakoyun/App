import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useDbQuery } from '@/db/changes';
import { createLocation, locationTree } from '@/data/locations';
import { space, useTheme } from '@/theme';
import { Sheet } from './Sheet';
import { AppText, Button, Divider, IconButton, TextField } from './ui';

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
  allowNone = true,
}: {
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

  return (
    <Sheet visible={visible} onClose={close} title={title}>
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
              setAdding(true);
            }}
          />
          <Divider inset={space.lg + node.depth * 20} />
        </View>
      ))}

      <View style={{ padding: space.lg, gap: space.md }}>
        {adding ? (
          <>
            <TextField
              autoFocus
              label={parent ? `“${parent.path}” içine` : 'Yeni konum'}
              placeholder={parent ? 'ör. 2. raf' : 'ör. Salon'}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={submit}
              returnKeyType="done"
            />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title="Vazgeç" kind="ghost" compact onPress={() => setAdding(false)} style={{ flex: 1 }} />
              <Button title="Ekle ve seç" compact onPress={submit} disabled={!draft.trim()} style={{ flex: 1 }} />
            </View>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setParent(null);
              setAdding(true);
            }}
            style={styles.addRow}
          >
            <Ionicons name="add" size={20} color={c.primary} />
            <AppText color={c.primary} variant="label" style={{ fontSize: 16 }}>
              Yeni konum
            </AppText>
          </Pressable>
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
    <View style={[styles.option, { paddingLeft: space.lg + depth * 20 }]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        onPress={onPress}
        style={({ pressed }) => [styles.optionMain, { opacity: pressed ? 0.6 : 1 }]}
      >
        {depth > 0 ? <Ionicons name="return-down-forward" size={14} color={c.textFaint} /> : null}
        <AppText style={{ flex: 1 }} muted={muted} variant={depth === 0 && !muted ? 'label' : 'body'}>
          {label}
        </AppText>
        {selected ? <Ionicons name="checkmark" size={20} color={c.primary} /> : null}
      </Pressable>
      {onAddChild ? (
        <IconButton
          icon="add-circle-outline"
          label={`${label} içine konum ekle`}
          onPress={onAddChild}
          color={c.textMuted}
          size={20}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  option: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingRight: space.sm },
  optionMain: { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
});
