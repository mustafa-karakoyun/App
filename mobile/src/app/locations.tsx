import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { AppText, Button, Divider, EmptyState, IconButton, TextField } from '@/components/ui';
import { useDbQuery } from '@/db/changes';
import { countBooksByLocation, createLocation, deleteLocation, locationTree, renameLocation, type LocationNode } from '@/data/locations';
import { confirm } from '@/lib/confirm';
import { space, useTheme } from '@/theme';

type Editing = { mode: 'create'; parent: LocationNode | null } | { mode: 'rename'; node: LocationNode };

/** Konum yönetimi: oda > raf > kutu. Silinen konumdaki kitaplar silinmez, konumsuz kalır. */
export default function LocationsScreen() {
  const { c } = useTheme();
  const toast = useToast();
  const tree = useDbQuery(() => locationTree(), [], ['locations']);
  const counts = useDbQuery(() => countBooksByLocation(), [], ['user_books', 'locations']);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [name, setName] = useState('');

  const open = (e: Editing) => {
    setEditing(e);
    setName(e.mode === 'rename' ? e.node.name : '');
  };

  const save = () => {
    if (!editing || !name.trim()) return;
    if (editing.mode === 'create') createLocation(name, editing.parent?.id ?? null);
    else renameLocation(editing.node.id, name);
    setEditing(null);
  };

  const remove = async (node: LocationNode) => {
    const ok = await confirm({
      title: `“${node.name}” silinsin mi?`,
      message: 'İçindeki alt konumlar da silinir. Kitaplar kütüphanende kalır, yalnızca konumsuz olur.',
      confirmLabel: 'Sil',
      destructive: true,
    });
    if (!ok) return;
    deleteLocation(node.id);
    setEditing(null);
    toast('Konum silindi');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
        <AppText muted style={{ padding: space.lg }}>
          Kitapların nerede durduğunu kaydet: önce odalar, sonra içine raflar ve kutular.
        </AppText>
        {tree.length === 0 ? (
          <EmptyState icon="location-outline" title="Henüz konum yok" body="Örneğin “Salon”, içinde “2. raf”." />
        ) : (
          <Divider />
        )}
        {tree.map((node) => (
          <View key={node.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Yeniden adlandır ya da sil"
              onPress={() => open({ mode: 'rename', node })}
              style={({ pressed }) => [
                styles.row,
                { paddingLeft: space.lg + node.depth * 22, backgroundColor: pressed ? c.bgSunken : 'transparent' },
              ]}
            >
              {node.depth > 0 ? <Ionicons name="return-down-forward" size={14} color={c.textFaint} /> : null}
              <AppText variant={node.depth === 0 ? 'label' : 'body'} style={{ flex: 1, fontSize: 16 }}>
                {node.name}
              </AppText>
              <AppText variant="small" faint>
                {counts.get(node.id) ? `${counts.get(node.id)} kitap` : ''}
              </AppText>
              <IconButton icon="add-circle-outline" label={`${node.name} içine ekle`} color={c.textMuted} size={20} onPress={() => open({ mode: 'create', parent: node })} />
            </Pressable>
            <Divider inset={space.lg + node.depth * 22} />
          </View>
        ))}
        <View style={{ padding: space.lg }}>
          <Button title="Oda ya da alan ekle" icon="add" kind="secondary" onPress={() => open({ mode: 'create', parent: null })} />
        </View>
      </ScrollView>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.mode === 'rename' ? 'Konumu düzenle' : editing?.parent ? `“${editing.parent.path}” içine` : 'Yeni konum'}
        footer={
          <View style={{ gap: space.sm }}>
            <Button title="Kaydet" onPress={save} disabled={!name.trim()} />
            {editing?.mode === 'rename' ? <Button title="Sil" kind="danger" onPress={() => remove(editing.node)} /> : null}
          </View>
        }
      >
        <View style={{ paddingHorizontal: space.lg }}>
          <TextField
            autoFocus
            value={name}
            onChangeText={setName}
            placeholder={editing?.mode === 'create' && editing.parent ? 'ör. 2. raf' : 'ör. Salon'}
            onSubmitEditing={save}
            returnKeyType="done"
          />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingRight: space.sm },
});
