import { Ionicons } from '@expo/vector-icons';
import { useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarcodeMode } from '@/components/scan/BarcodeMode';
import { ShelfMode } from '@/components/scan/ShelfMode';
import { AppText, Button, IconButton, Segmented } from '@/components/ui';
import { getKv, setKv } from '@/data/kv';
import { space } from '@/theme';

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

  const modeSwitcher = (
    <View style={{ paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.md }}>
      <Segmented options={MODES} value={mode} onChange={changeMode} onDark />
    </View>
  );

  const closeButton = (
    <View style={[styles.close, { top: insets.top + space.sm }]}>
      <IconButton icon="close" label="Kapat" color="#fff" size={28} onPress={() => router.back()} />
    </View>
  );

  if (!permission) return <View style={styles.dark} />;

  if (!permission.granted) {
    return (
      <View style={[styles.dark, { paddingTop: insets.top }]}>
        {closeButton}
        <View style={styles.permission}>
          <Ionicons name="camera-outline" size={44} color="#F5F0E6" />
          <AppText variant="title" color="#F5F0E6" style={{ textAlign: 'center' }}>
            Kamera izni gerekiyor
          </AppText>
          <AppText color="#CFC6B6" style={{ textAlign: 'center' }}>
            Raf fotoğrafı çekmek ve barkod okumak için kameraya erişmemiz gerekiyor. Fotoğraflar yalnızca kitapları
            tanımak için işlenir, saklanmaz.
          </AppText>
          {permission.canAskAgain ? (
            <Button title="İzin ver" onPress={requestPermission} style={{ alignSelf: 'stretch' }} />
          ) : (
            <Button title="Ayarları aç" onPress={() => Linking.openSettings()} style={{ alignSelf: 'stretch' }} />
          )}
          <Button title="Elle ekle" kind="ghost" onPress={() => router.replace('/book/add')} />
        </View>
        {modeSwitcher}
      </View>
    );
  }

  return (
    <View style={styles.dark}>
      {mode === 'shelf' ? <ShelfMode footer={modeSwitcher} /> : <BarcodeMode footer={modeSwitcher} />}
      {closeButton}
    </View>
  );
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: '#0F0E0C' },
  close: { position: 'absolute', left: space.sm, zIndex: 10 },
  permission: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.lg, paddingHorizontal: space.xl },
});
