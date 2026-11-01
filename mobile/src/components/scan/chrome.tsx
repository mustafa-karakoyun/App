import { Ionicons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText, type IconName } from '@/components/ui';
import { cam, space, useTheme } from '@/theme';

/** Kamera üstündeki yuvarlak düğme (kapat, flaş). */
export function CamButton({
  icon,
  label,
  onPress,
  active,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active !== undefined ? { selected: active } : undefined}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.camButton, { opacity: pressed ? 0.6 : 1 }, style]}
    >
      <Ionicons name={icon} size={24} color={active ? cam.success : cam.text} />
    </Pressable>
  );
}

/** Köşe kollarıyla çizilmiş tarama çerçevesi. */
export function ScanFrame({
  style,
  arm = 30,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  arm?: number;
  children?: ReactNode;
}) {
  return (
    <View style={style} pointerEvents="none">
      {(['tl', 'tr', 'bl', 'br'] as const).map((k) => (
        <View key={k} style={[styles.corner, styles[k], { width: arm, height: arm }]} />
      ))}
      {children}
    </View>
  );
}

/** Kamera alt paneli: kağıt zemin, üstte tutamak (barkod sonuç kartı). */
export function CamPanel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: c.bg }, style]}>
      <View style={[styles.grabber, { backgroundColor: c.hairline }]} />
      {children}
    </View>
  );
}

/** Kamera ekranındaki iki satırlık ipucu hapı. */
export function TipPill({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.tip} pointerEvents="none">
      <AppText variant="small" color={cam.text} style={{ fontWeight: '600', textAlign: 'center' }}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="small" color={cam.muted} style={{ fontSize: 12, textAlign: 'center' }}>
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  camButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: cam.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: { position: 'absolute', borderColor: cam.text },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  panel: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.md,
  },
  grabber: { width: 40, height: 5, borderRadius: 2.5, alignSelf: 'center', marginBottom: space.xs },
  tip: {
    alignSelf: 'center',
    maxWidth: 330,
    backgroundColor: cam.scrim,
    borderRadius: 23,
    paddingHorizontal: space.lg,
    paddingVertical: 7,
    minHeight: 46,
    justifyContent: 'center',
  },
});
