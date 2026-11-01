import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { AppText, Button } from '@/components/ui';
import { preparePhoto, runShelfScan } from '@/data/scans';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, locative } from '@/lib/format';
import { goBack } from '@/lib/nav';
import { cam, space, useTheme } from '@/theme';
import { CamButton, ScanFrame, TipPill } from './chrome';

const STEPS = ['Fotoğraf yüklendi', 'Sırtlar okunuyor', 'Kitaplar eşleştirilecek', 'Liste hazırlanacak'];
const STEPS_ACTIVE = ['Fotoğraf yükleniyor', 'Sırtlar okunuyor', 'Kitaplar eşleştiriliyor', 'Liste hazırlanıyor'];

const TIPS = [
  { icon: 'albums-outline', text: 'Her seferinde tek raf çek; birden fazla raf okumayı zorlaştırır.' },
  { icon: 'phone-portrait-outline', text: 'Telefonu dik ve rafa paralel tut, eğik çekme.' },
  { icon: 'sunny-outline', text: 'İyi ışıkta çek; gerekirse flaşı aç.' },
  { icon: 'text-outline', text: 'İnce ya da yatay duran kitaplar okunmayabilir; onları barkodla ekle.' },
] as const;

type Photo = { uri: string; width?: number; height?: number };
type Problem = { kind: 'quota'; resetsAt: string | null } | { kind: 'error'; message: string };

/** Raf modu: ipucu → çek → onayla ya da yeniden çek → işleniyor → onay listesi. */
export function ShelfMode({ modeSwitcher }: { modeSwitcher: ReactNode }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const camera = useRef<CameraView>(null);
  const detached = useRef(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [torch, setTorch] = useState(false);
  const [tips, setTips] = useState(false);

  useEffect(() => {
    if (!busy) return;
    // Sunucu tek yanıt veriyor; adımlar beklemeyi anlamlandırmak için zamanla ilerler.
    const timers = [1500, 6000, 12000].map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [busy]);

  const capture = async () => {
    try {
      const pic = await camera.current?.takePictureAsync({ quality: 0.85 });
      if (pic) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setPhoto({ uri: pic.uri, width: pic.width, height: pic.height });
        setProblem(null);
      }
    } catch {
      toast('Fotoğraf çekilemedi, tekrar dene');
    }
  };

  const pickFromLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    const asset = res.canceled ? null : res.assets[0];
    if (asset) {
      setPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
      setProblem(null);
    }
  };

  const submit = async () => {
    if (!photo) return;
    if (!user) {
      router.push({ pathname: '/auth/login', params: { reason: 'scan' } });
      return;
    }
    setStep(0);
    setBusy(true);
    setProblem(null);
    detached.current = false;
    try {
      const prepared = await preparePhoto(photo.uri, photo.width, photo.height);
      const result = await runShelfScan(prepared, () => detached.current);
      if (detached.current) return;
      if (result.kind === 'queued') {
        toast({
          icon: 'cloud-offline-outline',
          title: 'İnternet yok gibi görünüyor.',
          message: 'Fotoğraf kuyruğa alındı, hazır olunca haber vereceğiz.',
          actionLabel: 'Tamam',
          durationMs: 6000,
        });
        goBack();
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace({ pathname: '/scan/review', params: { pending: result.pendingId } });
    } catch (err) {
      if (detached.current) return;
      if (err instanceof ApiError && err.code === 'quota_exceeded') {
        const quota = (err.body?.quota ?? null) as { resets_at?: string } | null;
        setProblem({ kind: 'quota', resetsAt: quota?.resets_at ?? null });
      } else {
        setProblem({ kind: 'error', message: err instanceof Error ? err.message : 'Raf okunamadı' });
      }
    } finally {
      setBusy(false);
    }
  };

  /** İşleme sürerken kapatmak taramayı durdurmaz; bitince bildirim gelir. */
  const closeWhileBusy = () => {
    detached.current = true;
    toast('Taramaya devam ediyoruz; hazır olunca bildirim gelecek.');
    goBack();
  };

  const topBar = (
    <View style={[styles.topBar, { top: insets.top + space.sm }]}>
      <CamButton
        icon={busy ? 'chevron-down' : 'close'}
        label={busy ? 'Kapat, arka planda devam etsin' : 'Kapat'}
        onPress={busy ? closeWhileBusy : goBack}
      />
      {!photo ? (
        <CamButton
          icon={torch ? 'flash' : 'flash-outline'}
          label={torch ? 'Flaşı kapat' : 'Flaşı aç'}
          active={torch}
          onPress={() => setTorch((t) => !t)}
        />
      ) : null}
    </View>
  );

  if (photo) {
    return (
      <View style={{ flex: 1 }}>
        <View style={[styles.previewArea, { paddingTop: insets.top + 64 }]}>
          <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
          {busy ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,14,12,0.35)' }]} /> : null}
        </View>
        <View style={[styles.previewBottom, { paddingBottom: insets.bottom + space.lg }]}>
          {busy ? (
            <Processing step={step} />
          ) : problem?.kind === 'quota' ? (
            <>
              <View style={styles.errorBand}>
                <Ionicons name="alert-circle-outline" size={22} color={cam.error} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="sub" color={cam.text} style={{ fontWeight: '700' }}>
                    Bu ayki raf tarama hakkın doldu.
                  </AppText>
                  <AppText variant="small" color={cam.muted}>
                    {`Barkod ve elle ekleme sınırsız.${problem.resetsAt ? ` Hak ${locative(formatDate(problem.resetsAt))} yenilenir.` : ''}`}
                  </AppText>
                </View>
              </View>
              <View style={styles.actions}>
                <Button
                  title="Barkoda geç"
                  kind="onDark"
                  style={styles.flex}
                  onPress={() => router.replace({ pathname: '/scan', params: { mode: 'barcode' } })}
                />
                <Button
                  title="Elle ekle"
                  kind="onDarkPrimary"
                  style={styles.flex}
                  onPress={() => router.replace('/book/add')}
                />
              </View>
            </>
          ) : (
            <>
              <View style={{ gap: 6, alignItems: 'center' }}>
                <AppText variant="title" color={cam.text}>
                  Sırtlar okunaklı mı?
                </AppText>
                <AppText variant="small" color={problem ? cam.error : cam.muted} style={{ textAlign: 'center' }}>
                  {problem?.kind === 'error'
                    ? problem.message
                    : user
                      ? 'Bulanıksa yeniden çek.'
                      : 'Raf tarama sunucuda yapıldığı için hesap gerekir. Fotoğrafın giriş sonrası kaybolmaz.'}
                </AppText>
              </View>
              <View style={styles.actions}>
                <Button title="Yeniden çek" kind="onDark" onPress={() => setPhoto(null)} style={styles.flex} />
                <Button
                  title={user ? 'Kitapları bul' : 'Giriş yap ve tara'}
                  kind="onDarkPrimary"
                  onPress={submit}
                  style={user ? styles.flex : { flex: 1.4 }}
                />
              </View>
            </>
          )}
        </View>
        {topBar}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} />
      {/* Çerçevenin dışı karartılır: kullanıcı yalnızca tek rafa odaklansın. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[styles.dim, { height: insets.top + 160 }]} />
        <View style={{ flexDirection: 'row', height: 340 }}>
          <View style={[styles.dim, { width: 22 }]} />
          <ScanFrame style={{ flex: 1 }} />
          <View style={[styles.dim, { width: 22 }]} />
        </View>
        <View style={[styles.dim, { flex: 1, alignItems: 'center', paddingTop: space.md }]}>
          <AppText variant="small" color={cam.text} style={{ fontWeight: '600' }}>
            Rafı çerçevenin içine al
          </AppText>
        </View>
      </View>
      <View style={[styles.tipWrap, { top: insets.top + 60 }]} pointerEvents="none">
        <TipPill title="Tek raf · telefonu dik ve rafa paralel tut" body="iyi ışıkta, sırtlar okunaklı olsun" />
      </View>
      <View style={[styles.bottomCamera, { paddingBottom: insets.bottom + space.md }]}>
        {modeSwitcher}
        <View style={styles.shutterRow}>
          <SideButton icon="images-outline" label="Galeri" onPress={pickFromLibrary} boxed />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fotoğraf çek"
            onPress={capture}
            style={({ pressed }) => [styles.shutter, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <SideButton icon="help-circle-outline" label="İpuçları" onPress={() => setTips(true)} />
        </View>
      </View>
      {topBar}
      <Sheet visible={tips} onClose={() => setTips(false)} title="İyi bir raf fotoğrafı">
        <View style={{ paddingHorizontal: space.lg, gap: space.lg, paddingBottom: space.lg }}>
          {TIPS.map((t) => (
            <View key={t.text} style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
              <TipIcon name={t.icon} />
              <AppText style={{ flex: 1 }}>{t.text}</AppText>
            </View>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

function TipIcon({ name }: { name: (typeof TIPS)[number]['icon'] }) {
  const { c } = useTheme();
  return <Ionicons name={name} size={22} color={c.primary} />;
}

function SideButton({
  icon,
  label,
  onPress,
  boxed,
}: {
  icon: 'images-outline' | 'help-circle-outline';
  label: string;
  onPress: () => void;
  boxed?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.side}>
      <View style={[styles.sideIcon, boxed && styles.sideBoxed]}>
        <Ionicons name={icon} size={24} color={cam.text} />
      </View>
      <AppText variant="small" color={cam.muted} style={{ fontSize: 11 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Dürüst bekleme: zamanla ilerleyen adım listesi, sahte yüzde yok. */
function Processing({ step }: { step: number }) {
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: 10 }}>
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <View key={label} style={styles.step}>
              {done ? (
                <View style={[styles.stepDot, { backgroundColor: cam.success, borderColor: cam.success }]}>
                  <Ionicons name="checkmark" size={14} color={cam.bg} />
                </View>
              ) : active ? (
                <ActivityIndicator size="small" color={cam.text} style={{ width: 22 }} />
              ) : (
                <View style={styles.stepDot} />
              )}
              <AppText
                variant="sub"
                color={done || active ? cam.text : 'rgba(245,240,230,0.45)'}
                style={{ fontWeight: active ? '600' : '400' }}
              >
                {active ? `${STEPS_ACTIVE[i]}…` : label}
              </AppText>
            </View>
          );
        })}
      </View>
      <View style={{ gap: 2 }}>
        <AppText variant="small" color={cam.muted}>
          Genellikle 10–20 saniye sürer.
        </AppText>
        <AppText variant="small" color={cam.success} style={{ fontWeight: '600' }}>
          Kapatabilirsin; hazır olunca bildirim gelir.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { position: 'absolute', left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between' },
  tipWrap: { position: 'absolute', left: space.lg, right: space.lg },
  dim: { backgroundColor: 'rgba(15,14,12,0.62)' },
  bottomCamera: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: space.lg },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: cam.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: cam.text },
  side: { width: 64, alignItems: 'center', gap: 4 },
  sideIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  sideBoxed: { borderRadius: 10, backgroundColor: 'rgba(245,240,230,0.12)' },
  previewArea: { flex: 1 },
  previewBottom: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.xl, backgroundColor: cam.bg },
  actions: { flexDirection: 'row', gap: space.lg },
  errorBand: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: cam.errorBand,
    marginHorizontal: -space.lg,
    marginTop: -space.xl,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 24 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(245,240,230,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
