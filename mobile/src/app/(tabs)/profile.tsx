import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/components/Toast';
import { AppText, Button, Divider, LinkButton, PillButton, Row, SectionLabel } from '@/components/ui';
import { useDbQuery } from '@/db/changes';
import { statusCounts } from '@/data/library';
import { listLocations } from '@/data/locations';
import { notesByBook } from '@/data/notes';
import { fetchQuota } from '@/data/scans';
import { lastSyncAt, pendingChangeCount, syncNow, useSyncStatus } from '@/data/sync';
import { API_URL } from '@/lib/config';
import { confirm } from '@/lib/confirm';
import { deleteAccount, signOut, useAuth } from '@/lib/auth';
import { formatDate, initials, locative, relativeTime } from '@/lib/format';
import { radius, serif, space, useTheme } from '@/theme';

const INSET = space.lg + 22 + space.md;

export default function ProfileScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const sync = useSyncStatus();
  const counts = useDbQuery(() => statusCounts(), [], ['user_books']);
  const locationCount = useDbQuery(() => listLocations().length, [], ['locations']);
  const noteTotal = useDbQuery(() => notesByBook().total, [], ['notes', 'user_books']);
  const syncInfo = useDbQuery(
    () => ({ last: lastSyncAt(), pending: pendingChangeCount() }),
    [sync.running],
    ['kv', 'user_books', 'loans', 'locations', 'notes'],
  );
  const quota = useQuery({ queryKey: ['quota', user?.id], queryFn: fetchQuota, enabled: !!user });
  const [deleting, setDeleting] = useState(false);

  const syncFailed = !!sync.lastError || sync.offline;
  const syncSubtitle = sync.running
    ? 'Eşitleniyor…'
    : sync.offline
      ? 'Eşitlenemedi: internet yok, değişiklikler bekliyor'
      : sync.lastError
        ? 'Eşitlenemedi: sunucuya ulaşılamadı'
        : `Son eşitleme ${relativeTime(syncInfo.last)}${syncInfo.pending ? ` · ${syncInfo.pending} değişiklik bekliyor` : ''}`;

  const logout = async () => {
    const ok = await confirm({
      title: 'Çıkış yapılsın mı?',
      message: 'Kitapların bu cihazda kalır. Aynı hesapla tekrar giriş yaptığında yedekle birleşir.',
      confirmLabel: 'Çıkış yap',
    });
    if (!ok) return;
    await syncNow();
    await signOut();
    toast('Çıkış yapıldı');
  };

  const quotaText = !user
    ? 'Hesapla kullanılabilir'
    : quota.data
      ? `Bu ay ${quota.data.used}/${quota.data.limit} kullanıldı · ${locative(formatDate(quota.data.resets_at))} yenilenir`
      : quota.isError
        ? 'Şu an öğrenilemedi'
        : 'Yükleniyor…';

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: 60 }}
    >
      <View style={{ paddingHorizontal: space.lg }}>
        <AppText variant="display">Profil</AppText>
        <AppText variant="sub" muted>
          {`${counts.all} kitap · ${counts.read} okundu · ${counts.reading} okunuyor`}
        </AppText>
      </View>

      <SectionLabel>Hesap ve yedek</SectionLabel>
      {user ? (
        <>
          <View style={styles.account}>
            <View style={[styles.avatar, { backgroundColor: c.primary }]}>
              <AppText color={c.primaryText} style={{ fontWeight: '700', fontSize: 15 }}>
                {initials(user.name || user.email)}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={{ fontWeight: '600' }} numberOfLines={1}>
                {user.name || user.email}
              </AppText>
              {user.name ? (
                <AppText variant="small" muted numberOfLines={1}>
                  {user.email}
                </AppText>
              ) : null}
            </View>
          </View>
          <Divider inset={space.lg} />
          <Row
            icon={syncFailed ? 'alert-circle-outline' : 'cloud-outline'}
            iconColor={syncFailed ? c.accent : c.text}
            title="Bulut yedeği"
            subtitle={syncSubtitle}
            subtitleColor={syncFailed ? c.accent : undefined}
            right={<PillButton title={syncFailed ? 'Tekrar' : 'Eşitle'} strong onPress={() => void syncNow()} />}
          />
          <Divider inset={space.lg} />
          <Row icon="log-out-outline" iconColor={c.text} title="Çıkış yap" onPress={logout} chevron={false} />
        </>
      ) : (
        <View style={[styles.persuade, { backgroundColor: c.primarySoft }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Ionicons name="cloud-outline" size={24} color={c.text} />
            <AppText style={{ fontWeight: '700', fontSize: 17 }}>Kütüphanen yalnızca bu telefonda</AppText>
          </View>
          <AppText variant="secondary">
            {`Hesap açarsan ${counts.all ? `${counts.all} kitabın` : 'kitapların'} yedeklenir, telefon değişince kaybolmaz. Raf tarama da açılır: her ay 20 raf, bir rafta ~20 kitap.`}
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Button
              title="Hesap oluştur"
              onPress={() => router.push('/auth/register')}
              style={{ flex: 1.45, minHeight: 46 }}
            />
            <Button
              title="Giriş yap"
              kind="secondary"
              onPress={() => router.push('/auth/login')}
              style={{ flex: 1, minHeight: 46 }}
            />
          </View>
        </View>
      )}

      <SectionLabel>Kütüphane</SectionLabel>
      <Row
        icon="location-outline"
        iconColor={c.text}
        title="Konumlar"
        subtitle="Oda, raf ve kutular"
        value={locationCount ? `${locationCount}` : 'Yok'}
        onPress={() => router.push('/locations')}
      />
      <Divider inset={INSET} />
      <Row
        icon="bookmark-outline"
        iconColor={c.text}
        title="Alıntılar ve notlar"
        subtitle="Tüm kitaplardaki kayıtların"
        value={noteTotal ? `${noteTotal}` : undefined}
        onPress={() => router.push('/notes')}
      />
      <Divider inset={INSET} />
      <View style={styles.quotaRow}>
        <Ionicons name="scan-outline" size={22} color={c.text} style={{ width: 22 }} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText>Raf tarama hakkı</AppText>
          <AppText variant="small" muted>
            {quotaText}
          </AppText>
          {quota.data ? (
            <View style={[styles.bar, { backgroundColor: c.bgSunken }]}>
              <View
                style={{
                  width: `${Math.min(100, (quota.data.used / Math.max(1, quota.data.limit)) * 100)}%`,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: c.primary,
                }}
              />
            </View>
          ) : null}
        </View>
      </View>
      <Divider inset={INSET} />
      <Row icon="barcode-outline" iconColor={c.text} title="Barkod ve elle ekleme" subtitle="Sınırsız" />

      <SectionLabel>Gizlilik</SectionLabel>
      <View style={{ flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg }}>
        <Ionicons name="shield-checkmark-outline" size={22} color={c.textMuted} />
        <AppText variant="secondary" muted style={{ flex: 1 }}>
          Raf fotoğrafların saklanmaz; yalnızca kitapları tanımak için işlenir ve hemen silinir. Ödünç verdiğin
          kişilerin yalnızca adı tutulur.
        </AppText>
      </View>

      {user ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.xl, gap: 2 }}>
          <LinkButton title="Hesabı sil" color={c.accent} onPress={() => setDeleting(true)} />
          <AppText variant="small" faint>
            Yedeğin ve hesabın kalıcı olarak silinir.
          </AppText>
        </View>
      ) : null}

      <AppText variant="small" faint style={{ paddingHorizontal: space.lg, paddingTop: space.xl, fontSize: 11 }}>
        {`Kitaplık ${Constants.expoConfig?.version ?? ''} · Sunucu: ${API_URL}`}
      </AppText>

      <DeleteAccountDialog
        visible={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          try {
            await deleteAccount();
            setDeleting(false);
            toast('Hesabın silindi');
          } catch (err) {
            toast((err as Error).message);
          }
        }}
      />
    </ScrollView>
  );
}

/** Geri alınamaz işlem için güçlü onay: kullanıcı "SİL" yazmadan düğme açılmaz. */
function DeleteAccountDialog({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { c } = useTheme();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = text.trim().toLocaleUpperCase('tr-TR') === 'SİL';

  const close = () => {
    setText('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.dialogWrap, { backgroundColor: c.overlay }]}
      >
        <View style={[styles.dialog, { backgroundColor: c.surface }]}>
          <View style={{ alignItems: 'center', gap: space.sm, padding: space.lg }}>
            <Ionicons name="alert-circle-outline" size={30} color={c.accent} />
            <AppText style={{ fontFamily: serif, fontSize: 19, fontWeight: '600' }}>Hesabın silinsin mi?</AppText>
            <AppText variant="small" muted style={{ textAlign: 'center' }}>
              Yedek ve hesap kalıcı olarak silinir. Bu telefondaki kitaplar da temizlenir. Onaylamak için SİL yaz.
            </AppText>
            <TextInput
              value={text}
              onChangeText={setText}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="SİL"
              placeholderTextColor={c.textFaint}
              accessibilityLabel="Onaylamak için SİL yaz"
              style={[styles.dialogInput, { borderColor: c.accent, color: c.text, backgroundColor: c.bg }]}
            />
          </View>
          <View style={[styles.dialogButtons, { borderTopColor: c.hairline }]}>
            <Pressable accessibilityRole="button" onPress={close} style={styles.dialogButton}>
              <AppText style={{ fontWeight: '600' }}>Vazgeç</AppText>
            </Pressable>
            <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: c.hairline }} />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !ok || busy }}
              disabled={!ok || busy}
              onPress={async () => {
                setBusy(true);
                await onConfirm();
                setBusy(false);
                setText('');
              }}
              style={[styles.dialogButton, { opacity: ok ? 1 : 0.4 }]}
            >
              <AppText color={c.accent} style={{ fontWeight: '700' }}>
                {busy ? 'Siliniyor…' : 'Hesabı sil'}
              </AppText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  persuade: { padding: space.lg, gap: space.md },
  quotaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  bar: { width: 180, height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  dialogWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.xl },
  dialog: { width: 310, maxWidth: '100%', borderRadius: radius.lg, overflow: 'hidden' },
  dialogInput: {
    alignSelf: 'stretch',
    height: 42,
    borderWidth: 1.4,
    borderRadius: radius.seg,
    paddingHorizontal: space.md,
    fontSize: 16,
    fontWeight: '600',
    marginTop: space.sm,
  },
  dialogButtons: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  dialogButton: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
});
