import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BackLink } from '@/components/BackLink';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { AppText, Button, Chip, EmptyState, IconButton, LinkButton, TextField } from '@/components/ui';
import { useDbQuery } from '@/db/changes';
import { listLibrary } from '@/data/library';
import {
  countBooksByLocation,
  createLocation,
  deleteLocation,
  descendantIds,
  locationTree,
  renameLocation,
  type LocationNode,
} from '@/data/locations';
import { confirm } from '@/lib/confirm';
import { space, useTheme } from '@/theme';

type Editing = { mode: 'create'; parent: LocationNode | null } | { mode: 'rename'; node: LocationNode };

const QUICK_START = ['Salon', 'Çalışma odası', 'Yatak odası'];

/** Konum yönetimi: oda > raf > kutu. Silinen konumdaki kitaplar silinmez, konumsuz kalır. */
export default function LocationsScreen() {
  const { c } = useTheme();
  const toast = useToast();
  const tree = useDbQuery(() => locationTree(), [], ['locations']);
  const direct = useDbQuery(() => countBooksByLocation(), [], ['user_books', 'locations']);
  const unplaced = useDbQuery(() => listLibrary({ unplaced: true }).length, [], ['user_books', 'locations']);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [name, setName] = useState('');

  // Odanın sayısı içindeki raf ve kutuları da kapsar.
  const total = (id: string) => [...descendantIds(id, tree)].reduce((sum, d) => sum + (direct.get(d) ?? 0), 0);

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
    const count = total(node.id);
    const ok = await confirm({
      title: `“${node.name}” silinsin mi?`,
      message: `İçindeki alt konumlar da silinir. Kitaplar kütüphanende kalır, yalnızca konumsuz olur${count ? ` (${count} kitap)` : ''}.`,
      confirmLabel: 'Sil',
      destructive: true,
    });
    if (!ok) return;
    deleteLocation(node.id);
    setEditing(null);
    toast('Konum silindi');
  };

  const parentPath = editing?.mode === 'rename' ? editing.node.path.split(' / ').slice(0, -1).join(' / ') : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerLeft: () => <BackLink label="Profil" /> }} />
      {tree.length === 0 ? (
        <EmptyState
          icon="location-outline"
          title="Henüz konum yok"
          body="Örneğin “Salon”, içinde “2. raf”."
          action={
            <>
              <Button title="Oda ya da alan ekle" icon="add" onPress={() => open({ mode: 'create', parent: null })} />
              <AppText variant="small" faint>
                Hızlı başla:
              </AppText>
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
                {QUICK_START.map((q) => (
                  <Chip key={q} label={q} filled onPress={() => createLocation(q, null)} />
                ))}
              </View>
            </>
          }
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          <AppText
            variant="secondary"
            muted
            style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}
          >
            Kitapların nerede durduğunu kaydet: önce odalar, sonra içine raflar ve kutular.
          </AppText>
          {tree.map((node) => {
            const count = total(node.id);
            return (
              <View key={node.id} style={[styles.row, { paddingLeft: space.lg + node.depth * 26 }]}>
                <View style={[styles.rowInner, { borderBottomColor: c.hairline }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityHint="Yeniden adlandır ya da sil"
                    onPress={() => open({ mode: 'rename', node })}
                    style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    {node.depth === 0 ? (
                      <Ionicons name="location-outline" size={22} color={c.textMuted} />
                    ) : (
                      <Ionicons name="return-down-forward" size={16} color={c.textFaint} />
                    )}
                    <AppText style={{ flex: 1, fontWeight: node.depth === 0 ? '600' : '400' }} numberOfLines={1}>
                      {node.name}
                    </AppText>
                    <AppText variant="small" faint>
                      {count ? `${count} kitap` : ''}
                    </AppText>
                  </Pressable>
                  <IconButton
                    icon="add"
                    label={`${node.name} içine ekle`}
                    color={c.text}
                    size={24}
                    onPress={() => open({ mode: 'create', parent: node })}
                  />
                </View>
              </View>
            );
          })}
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md }}>
            <LinkButton title="Oda ya da alan ekle" icon="add" onPress={() => open({ mode: 'create', parent: null })} />
            {unplaced ? <AppText variant="small" muted>{`Konumsuz: ${unplaced} kitap`}</AppText> : null}
          </View>
        </ScrollView>
      )}

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={
          editing?.mode === 'rename'
            ? 'Konumu düzenle'
            : editing?.parent
              ? `“${editing.parent.path}” içine`
              : 'Yeni konum'
        }
        subtitle={
          editing?.mode === 'rename'
            ? [
                parentPath ? `${parentPath} içinde` : null,
                total(editing.node.id) ? `${total(editing.node.id)} kitap` : null,
              ]
                .filter(Boolean)
                .join(' · ') || null
            : null
        }
        footer={
          <View style={{ gap: space.sm, alignItems: 'stretch' }}>
            <Button title="Kaydet" onPress={save} disabled={!name.trim()} />
            {editing?.mode === 'rename' ? (
              <LinkButton
                title="Sil"
                color={c.accent}
                onPress={() => remove(editing.node)}
                style={{ alignSelf: 'center' }}
              />
            ) : null}
          </View>
        }
      >
        <View style={{ paddingHorizontal: space.lg }}>
          <TextField
            label="Ad"
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
  row: { flexDirection: 'row' },
  rowInner: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingRight: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md },
});
