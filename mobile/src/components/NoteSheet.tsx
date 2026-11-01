import { Ionicons } from '@expo/vector-icons';
import type { NoteKind } from '@kitaplik/shared';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { addNote, deleteNote, NOTE_MAX_LENGTH, restoreNote, updateNote } from '@/data/notes';
import type { NoteRow } from '@/db/schema';
import { radius, space, type, useTheme } from '@/theme';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import { AppText, Button, LinkButton, Segmented, TextField } from './ui';

const KINDS: { value: NoteKind; label: string }[] = [
  { value: 'quote', label: 'Alıntı' },
  { value: 'note', label: 'Not' },
];

/** Alıntı ya da not ekleme/düzenleme. Alıntı serif italik yazılır: kitaptan geldiği belli olsun. */
export function NoteSheet({
  visible,
  onClose,
  userBookId,
  bookTitle,
  initialKind = 'quote',
  editing,
}: {
  visible: boolean;
  onClose: () => void;
  userBookId: string;
  bookTitle: string;
  initialKind?: NoteKind;
  editing?: NoteRow | null;
}) {
  const { c } = useTheme();
  const toast = useToast();
  // Her açılışta yeniden bağlanır (çağıran koşullu çizer); başlangıç değerleri props'tan.
  const [kind, setKind] = useState<NoteKind>(editing?.kind ?? initialKind);
  const [text, setText] = useState(editing?.text ?? '');
  const [page, setPage] = useState(editing?.page != null ? String(editing.page) : '');

  const pageNum = page.trim() ? Number(page.replace(/\D/g, '')) || null : null;

  const save = () => {
    if (!text.trim()) return;
    if (editing) {
      updateNote(editing.id, { kind, text, page: pageNum });
      toast(kind === 'quote' ? 'Alıntı güncellendi' : 'Not güncellendi');
    } else {
      addNote(userBookId, { kind, text, page: pageNum });
      toast(kind === 'quote' ? 'Alıntı kaydedildi' : 'Not kaydedildi');
    }
    onClose();
  };

  const remove = () => {
    if (!editing) return;
    deleteNote(editing.id);
    onClose();
    toast({
      message: editing.kind === 'quote' ? 'Alıntı silindi' : 'Not silindi',
      actionLabel: 'Geri al',
      onAction: () => restoreNote(editing.id),
    });
  };

  const title = editing ? 'Düzenle' : kind === 'quote' ? 'Alıntı ekle' : 'Not ekle';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={`“${bookTitle}”`}
      footer={<Button title="Kaydet" onPress={save} disabled={!text.trim()} />}
    >
      <View style={{ paddingHorizontal: space.lg, gap: space.lg, paddingBottom: space.sm }}>
        <Segmented options={KINDS} value={kind} onChange={setKind} />
        <View>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            autoFocus={!editing}
            maxLength={NOTE_MAX_LENGTH}
            placeholder={kind === 'quote' ? 'Altını çizdiğin cümle…' : 'Aklından geçen…'}
            placeholderTextColor={c.textFaint}
            accessibilityLabel={kind === 'quote' ? 'Alıntı metni' : 'Not metni'}
            style={[
              styles.textArea,
              kind === 'quote' ? type.quote : type.body,
              { color: c.text, backgroundColor: c.surface, borderColor: text ? c.primary : c.hairline },
            ]}
          />
          <AppText variant="small" faint style={styles.counter}>
            {`${text.length}/${NOTE_MAX_LENGTH}`}
          </AppText>
        </View>
        <View style={styles.pageRow}>
          <View style={{ width: 120 }}>
            <TextField
              label={kind === 'quote' ? 'Sayfa' : 'Sayfa (isteğe bağlı)'}
              value={page}
              onChangeText={setPage}
              keyboardType="number-pad"
              maxLength={5}
            />
          </View>
          {kind === 'quote' ? (
            <View style={{ flex: 1, gap: 6 }}>
              {/* Cihazda metin tanıma development build ister; şimdilik devre dışı. */}
              <View style={[styles.scanButton, { borderColor: c.hairline }]} accessibilityState={{ disabled: true }}>
                <Ionicons name="camera-outline" size={20} color={c.textFaint} />
                <AppText color={c.textFaint} style={{ fontWeight: '600' }}>
                  Sayfayı tara
                </AppText>
              </View>
              <AppText variant="small" faint style={{ textAlign: 'center', fontSize: 12 }}>
                Metni fotoğraftan seçme yakında
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="small" faint>
          {kind === 'quote'
            ? 'Alıntılar yalnızca sende ve yedeğinde durur.'
            : 'Notlar yalnızca sende ve yedeğinde durur.'}
        </AppText>
        {editing ? <LinkButton title="Sil" color={c.accent} onPress={remove} style={{ alignSelf: 'center' }} /> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  textArea: {
    minHeight: 200,
    borderWidth: 1.2,
    borderRadius: radius.md,
    padding: space.md,
    paddingBottom: 28,
    textAlignVertical: 'top',
  },
  counter: { position: 'absolute', right: space.md, bottom: space.sm, fontSize: 11 },
  pageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.lg },
  scanButton: {
    minHeight: 48,
    borderWidth: 1.2,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
});
