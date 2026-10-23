import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/components/Toast';
import { AppText, Button, Divider, Row, SectionLabel } from '@/components/ui';
import { useDbQuery } from '@/db/changes';
import { statusCounts } from '@/data/library';
import { listLocations } from '@/data/locations';
import { fetchQuota } from '@/data/scans';
import { lastSyncAt, pendingChangeCount, syncNow, useSyncStatus, wipeLocalData } from '@/data/sync';
import { API_URL } from '@/lib/config';
import { confirm } from '@/lib/confirm';
import { deleteAccount, signOut, useAuth } from '@/lib/auth';
import { formatDate, relativeTime } from '@/lib/format';
import { space, useTheme } from '@/theme';

const INSET = space.lg + 28 + space.md;

export default function ProfileScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const sync = useSyncStatus();
  const counts = useDbQuery(() => statusCounts(), [], ['user_books']);
  const locationCount = useDbQuery(() => listLocations().length, [], ['locations']);
  const syncInfo = useDbQuery(
    () => ({ last: lastSyncAt(), pending: pendingChangeCount() }),
    [sync.running],
    ['kv', 'user_books', 'loans', 'locations'],
  );
  const quota = useQuery({ queryKey: ['quota', user?.id], queryFn: fetchQuota, enabled: !!user });

  const syncSubtitle = sync.running
    ? 'Eşitleniyor…'
    : sync.offline
      ? 'İnternet yok; değişiklikler bekliyor'
      : sync.lastError
        ? `Eşitlenemedi: ${sync.lastError}`
        : `Son eşitleme ${relativeTime(syncInfo.last)}${syncInfo.pending ? ` · ${syncInfo.pending} değişiklik bekliyor` : ''}`;

  const logout = async () => {
    const ok = await confirm({
      title: 'Çıkış yapılsın mı?',
      message: 'Kitapların bu cihazda kalır. Tekrar giriş yaptığında yedekle birleşir.',
      confirmLabel: 'Çıkış yap',
    });
    if (!ok) return;
    await syncNow();
    await signOut();
    toast('Çıkış yapıldı');
  };

  const removeAccount = async () => {
    const ok = await confirm({
      title: 'Hesap silinsin mi?',
      message: 'Sunucudaki yedeğin kalıcı olarak silinir. Bu cihazdaki kütüphanen de temizlenir. Geri alınamaz.',
      confirmLabel: 'Hesabı sil',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteAccount();
      wipeLocalData();
      toast('Hesabın silindi');
    } catch (err) {
      toast((err as Error).message);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xxl * 2 }}
    >
      <View style={{ paddingHorizontal: space.lg, gap: 2 }}>
        <AppText variant="display">Profil</AppText>
        <AppText muted>
          {counts.all} kitap · {counts.read} okundu · {counts.reading} okunuyor
        </AppText>
      </View>

      <SectionLabel>Hesap ve yedek</SectionLabel>
      <Divider />
      {user ? (
        <>
          <Row icon="person-circle-outline" title={user.name || user.email} subtitle={user.name ? user.email : null} />
          <Divider inset={INSET} />
          <Row
            icon={sync.offline ? 'cloud-offline-outline' : 'cloud-done-outline'}
            title="Bulut yedeği"
            subtitle={syncSubtitle}
            right={<Button title="Eşitle" kind="ghost" compact loading={sync.running} onPress={() => void syncNow()} />}
          />
          <Divider inset={INSET} />
          <Row icon="log-out-outline" title="Çıkış yap" onPress={logout} chevron={false} />
          <Divider />
        </>
      ) : (
        <View style={{ padding: space.lg, gap: space.md }}>
          <AppText>Kütüphanen şu an yalnızca bu telefonda.</AppText>
          <AppText muted>
            Hesap açarsan kitapların yedeklenir, telefon değişince kaybolmaz. Raf tarama için de hesap gerekiyor.
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Hesap oluştur" onPress={() => router.push('/auth/register')} style={{ flex: 1 }} />
            <Button title="Giriş yap" kind="secondary" onPress={() => router.push('/auth/login')} style={{ flex: 1 }} />
          </View>
        </View>
      )}

      <SectionLabel>Kütüphane</SectionLabel>
      <Divider />
      <Row
        icon="location-outline"
        title="Konumlar"
        value={locationCount ? `${locationCount}` : 'Yok'}
        subtitle="Oda, raf ve kutular"
        onPress={() => router.push('/locations')}
      />
      <Divider inset={INSET} />
      <Row
        icon="scan-outline"
        title="Raf tarama hakkı"
        subtitle={
          !user
            ? 'Hesapla kullanılabilir'
            : quota.data
              ? `Bu ay ${quota.data.used}/${quota.data.limit} kullanıldı · ${formatDate(quota.data.resets_at)} yenilenir`
              : quota.isError
                ? 'Şu an öğrenilemedi'
                : 'Yükleniyor…'
        }
      />
      <Divider inset={INSET} />
      <Row icon="barcode-outline" title="Barkod ve elle ekleme" subtitle="Sınırsız" />
      <Divider />

      <SectionLabel>Gizlilik</SectionLabel>
      <Divider />
      <Row
        icon="shield-checkmark-outline"
        title="Raf fotoğrafların saklanmaz"
        subtitle="Fotoğraf yalnızca kitapları tanımak için işlenir ve hemen silinir. Ödünç verdiğin kişilerin yalnızca adı tutulur."
        subtitleLines={4}
      />
      <Divider />

      {user ? (
        <View style={{ padding: space.lg }}>
          <Button title="Hesabı sil" kind="danger" compact onPress={removeAccount} />
        </View>
      ) : null}

      <AppText variant="small" faint style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
        Kitaplık {Constants.expoConfig?.version ?? ''} · Sunucu: {API_URL}
      </AppText>
    </ScrollView>
  );
}
