import { Ionicons } from '@expo/vector-icons';
import { useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarcodeMode } from '@/components/scan/BarcodeMode';
import { CamButton } from '@/components/scan/chrome';
import { ShelfMode } from '@/components/scan/ShelfMode';
import { AppText, Button, Segmented } from '@/components/ui';
import { getKv, setKv } from '@/data/kv';
import { goBack } from '@/lib/nav';
import { cam, space } from '@/theme';

type Mode = 'shelf' | 'barcode' | 'manual';

const MODES: { value: Mode; label: string }[] = [
  { value: 'shelf', label: 'Raf' },
  { value: 'barcode', label: 'Barkod' },
  { value: 'manual', label: 'Elle' },
];

/** Tara: kamera tam ekran, altta mod seçimi. Son kullanılan mod hatırlanır. */
export default function ScanScreen() {
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>(() => params.mode ?? (getKv('scan.mode') as Mode | null) ?? 'shelf');
  const [permission, requestPermission] = useCameraPermissions();

  const changeMode = (m: Mode) => {
    if (m === 'manual') {
      router.replace('/book/add');
      return;
    }
    setKv('scan.mode', m);
    setMode(m);
  };

  const modeSwitcher = <Segmented options={MODES} value={mode} onChange={changeMode} onDark style={styles.segment} />;

  if (!permission) return <View style={styles.dark} />;

  if (!permission.granted) {
    return (
      <View style={[styles.dark, { paddingTop: insets.top, paddingBottom: insets.bottom + space.lg }]}>
        <CamButton icon="close" label="Kapat" onPress={goBack} style={styles.close} />
        <View style={styles.permission}>
          <Ionicons name="camera-outline" size={52} color={cam.text} />
          <AppText variant="title" color={cam.text} style={{ textAlign: 'center', fontSize: 24 }}>
            Kamera izni gerekiyor
          </AppText>
          <AppText variant="sub" color={cam.muted} style={{ textAlign: 'center' }}>
            Rafını ya da barkodu okumak için kameraya ihtiyacımız var. Fotoğraflar yalnızca kitapları tanımak için
            işlenir, saklanmaz.
          </AppText>
          <View style={styles.shield}>
            <Ionicons name="shield-checkmark-outline" size={16} color={cam.success} />
            <AppText variant="small" color={cam.success} style={{ fontWeight: '600' }}>
              Fotoğraf cihazdan çıkınca hemen silinir
            </AppText>
          </View>
        </View>
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          {permission.canAskAgain ? (
            <Button title="İzin ver" kind="onDarkPrimary" onPress={requestPermission} />
          ) : (
            <Button title="Ayarları aç" kind="onDarkPrimary" onPress={() => Linking.openSettings()} />
          )}
          <Button title="Elle ekle" kind="onDark" onPress={() => router.replace('/book/add')} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.dark}>
      {mode === 'shelf' ? <ShelfMode modeSwitcher={modeSwitcher} /> : <BarcodeMode modeSwitcher={modeSwitcher} />}
    </View>
  );
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: cam.bg },
  close: { marginLeft: 14, marginTop: space.sm },
  segment: { width: 240, alignSelf: 'center' },
  permission: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.lg, paddingHorizontal: space.xl },
  shield: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm },
});
