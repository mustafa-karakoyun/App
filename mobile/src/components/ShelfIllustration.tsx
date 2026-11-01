import { StyleSheet, View } from 'react-native';
import { SPINES, useTheme } from '@/theme';

const HEIGHTS = [100, 88, 108, 96, 82, 104, 92];

/** Boş kütüphane için: tarama köşeleri içinde bir raf. Görsel dosyası yerine çizim. */
export function ShelfIllustration() {
  const { c } = useTheme();
  return (
    <View style={styles.frame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {(['tl', 'tr', 'bl', 'br'] as const).map((k) => (
        <View key={k} style={[styles.corner, styles[k], { borderColor: c.primary }]} />
      ))}
      <View style={styles.books}>
        {HEIGHTS.map((h, i) => (
          <View key={i} style={{ width: 22, height: h, backgroundColor: SPINES[i], borderRadius: 1 }} />
        ))}
      </View>
      <View style={[styles.shelf, { backgroundColor: c.text }]} />
    </View>
  );
}

const ARM = 14;
const styles = StyleSheet.create({
  frame: {
    width: 240,
    height: 164,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 24,
    marginBottom: 8,
  },
  corner: { position: 'absolute', width: ARM, height: ARM },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  books: { flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  shelf: { width: 210, height: 2, marginTop: 0 },
});
