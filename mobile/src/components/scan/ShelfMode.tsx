import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/components/Toast';
import { AppText, Button } from '@/components/ui';
import { db } from '@/db/client';
import { notifyChange } from '@/db/changes';
import { pendingScans } from '@/db/schema';
import { preparePhoto, queueShelfPhoto, uploadShelf } from '@/data/scans';
import { newId, now } from '@/data/util';
import { ApiError, isOffline } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { radius, space } from '@/theme';

const STAGES = ['Fotoğraf yükleniyor', 'Sırtlar okunuyor', 'Kitaplar eşleştiriliyor', 'Neredeyse bitti'];

type Photo = { uri: string; width?: number; height?: number };

/** Raf modu: ipucu → çek → onayla ya da yeniden çek → işleniyor → onay listesi. */
export function ShelfMode({ footer }: { footer: ReactNode }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const camera = useRef<CameraView>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;
    // Sunucu tek yanıt veriyor; aşamalar beklemeyi anlamlandırmak için zamanla ilerler.
    const timers = [1500, 5000, 11000].map((ms, i) => setTimeout(() => setStage(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [busy]);

  const capture = async () => {
    try {
      const pic = await camera.current?.takePictureAsync({ quality: 0.85 });
      if (pic) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setPhoto({ uri: pic.uri, width: pic.width, height: pic.height });
        setError(null);
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
      setError(null);
    }
  };

  const submit = async () => {
    if (!photo) return;
    if (!user) {
      router.push({ pathname: '/auth/login', params: { reason: 'scan' } });
      return;
    }
    setStage(0);
    setBusy(true);
    setError(null);
    let prepared = photo.uri;
    try {
      prepared = await preparePhoto(photo.uri, photo.width, photo.height);
      const result = await uploadShelf(prepared);
      const id = newId();
      db.insert(pendingScans)
        .values({
          id,
          photoUri: prepared,
          status: 'done',
          result: JSON.stringify(result),
          error: null,
          createdAt: now(),
        })
        .run();
      notifyChange('pending_scans');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace({ pathname: '/scan/review', params: { pending: id } });
    } catch (err) {
      if (isOffline(err) || (err instanceof ApiError && err.status >= 500)) {
        queueShelfPhoto(prepared);
        toast({
          message: 'İnternet yok gibi görünüyor. Fotoğraf kuyruğa alındı, hazır olunca haber vereceğiz.',
          durationMs: 5000,
        });
        router.back();
        return;
      }
      if (err instanceof ApiError && err.code === 'quota_exceeded') {
        setError(`${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : 'Raf okunamadı');
      }
    } finally {
      setBusy(false);
    }
  };

  if (photo) {
    return (
      <View style={{ flex: 1 }}>
        <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
        {busy ? (
          <View style={[StyleSheet.absoluteFill, styles.busy]}>
            <ActivityIndicator color="#F5F0E6" size="large" />
            <AppText variant="title" color="#F5F0E6">
              {STAGES[stage]}…
            </AppText>
            <AppText color="#CFC6B6">Genellikle 10–20 saniye sürer.</AppText>
          </View>
        ) : null}
        <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
          {error ? (
            <View style={styles.error}>
              <AppText color="#FFE9E6">{error}</AppText>
            </View>
          ) : (
            <AppText color="#E8E0D2" style={{ textAlign: 'center' }}>
              Sırtlar okunaklı mı? Bulanıksa yeniden çek.
            </AppText>
          )}
          <View style={styles.actions}>
            <Button
              title="Yeniden çek"
              kind="onDark"
              onPress={() => setPhoto(null)}
              disabled={busy}
              style={styles.flex}
            />
            <Button
              title={user ? 'Kitapları bul' : 'Giriş yap ve tara'}
              kind="onDarkPrimary"
              onPress={submit}
              loading={busy}
              style={styles.flex}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
      <View style={[styles.tip, { top: insets.top + space.xxl + space.md }]} pointerEvents="none">
        <AppText color="#F5F0E6" variant="label" style={{ textAlign: 'center' }}>
          Tek raf · telefonu dik ve rafa paralel tut · iyi ışık
        </AppText>
      </View>
      <View style={[styles.guide, { top: insets.top + 120 }]} pointerEvents="none" />
      <View style={styles.bottomCamera}>
        <View style={styles.shutterRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Galeriden seç"
            onPress={pickFromLibrary}
            style={styles.sideButton}
          >
            <Ionicons name="images-outline" size={26} color="#F5F0E6" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fotoğraf çek"
            onPress={capture}
            style={({ pressed }) => [styles.shutter, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <View style={styles.sideButton} />
        </View>
        {footer}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tip: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    backgroundColor: 'rgba(15,14,12,0.6)',
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  guide: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: 260,
    borderWidth: 1.5,
    borderColor: 'rgba(245,240,230,0.55)',
    borderRadius: radius.md,
  },
  bottomCamera: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: space.lg,
    paddingTop: space.lg,
    backgroundColor: 'rgba(15,14,12,0.55)',
  },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#F5F0E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F5F0E6' },
  sideButton: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.lg,
    gap: space.md,
    backgroundColor: 'rgba(15,14,12,0.78)',
  },
  actions: { flexDirection: 'row', gap: space.md },
  busy: { backgroundColor: 'rgba(15,14,12,0.72)', alignItems: 'center', justifyContent: 'center', gap: space.md },
  error: { backgroundColor: 'rgba(122,46,54,0.85)', borderRadius: radius.md, padding: space.md },
});
