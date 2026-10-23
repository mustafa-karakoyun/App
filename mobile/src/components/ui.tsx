import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { HIT, radius, space, type, useTheme } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type Variant = keyof typeof type;

export function AppText({
  variant = 'body',
  muted,
  faint,
  color,
  style,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean; faint?: boolean; color?: string }) {
  const { c } = useTheme();
  const tone = color ?? (faint ? c.textFaint : muted ? c.textMuted : c.text);
  return <Text {...rest} style={[type[variant] as TextStyle, { color: tone }, style]} />;
}

export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.hairline, marginLeft: inset }, style]} />;
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'onDark';

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  style,
  compact,
}: {
  title: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const { c } = useTheme();
  const palette: Record<ButtonKind, { bg: string; fg: string; border: string }> = {
    primary: { bg: c.primary, fg: c.primaryText, border: c.primary },
    secondary: { bg: 'transparent', fg: c.primary, border: c.primary },
    ghost: { bg: 'transparent', fg: c.primary, border: 'transparent' },
    danger: { bg: 'transparent', fg: c.accent, border: 'transparent' },
    // Kamera gibi koyu zeminlerde ikincil eylem.
    onDark: { bg: 'transparent', fg: '#F5F0E6', border: 'rgba(245,240,230,0.8)' },
  };
  const p = palette[kind];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: p.bg, borderColor: p.border, opacity: inactive ? 0.5 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={p.fg} /> : null}
          <Text style={[type.label, { color: p.fg, fontSize: 16 }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color,
  size = 22,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.5 : 1 }]}
    >
      <Ionicons name={icon} size={size} color={color ?? c.text} />
    </Pressable>
  );
}

/** Liste satırı: sol simge, başlık/alt metin, sağda değer ve ok. Kart yerine zemin üzerinde. */
export function Row({
  title,
  subtitle,
  value,
  icon,
  onPress,
  danger,
  right,
  chevron = !!onPress,
}: {
  title: string;
  subtitle?: string | null;
  value?: string | null;
  icon?: IconName;
  onPress?: () => void;
  danger?: boolean;
  right?: ReactNode;
  chevron?: boolean;
}) {
  const { c } = useTheme();
  const tone = danger ? c.accent : c.text;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.bgSunken : 'transparent' }]}
    >
      {icon ? <Ionicons name={icon} size={20} color={danger ? c.accent : c.textMuted} style={{ width: 28 }} /> : null}
      <View style={{ flex: 1 }}>
        <AppText color={tone}>{title}</AppText>
        {subtitle ? (
          <AppText variant="small" muted numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText muted numberOfLines={1} style={{ maxWidth: '50%', textAlign: 'right' }}>
          {value}
        </AppText>
      ) : null}
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={c.textFaint} /> : null}
    </Pressable>
  );
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.sm }, style]}>
      <AppText variant="overline" muted>
        {children}
      </AppText>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  count,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
  count?: number;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.primary : 'transparent',
          borderColor: selected ? c.primary : c.hairline,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={selected ? c.primaryText : c.textMuted} /> : null}
      <Text style={[type.label, { color: selected ? c.primaryText : c.text }]}>{label}</Text>
      {count !== undefined ? (
        <Text style={[type.small, { color: selected ? c.primaryText : c.textFaint }]}>{count}</Text>
      ) : null}
    </Pressable>
  );
}

/** Birbirini dışlayan seçenekler (okuma durumu, tarama modu). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  onDark,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  onDark?: boolean;
}) {
  const { c } = useTheme();
  const track = onDark ? 'rgba(255,255,255,0.14)' : c.bgSunken;
  return (
    <View style={[styles.segmented, { backgroundColor: track }]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        const activeBg = onDark ? 'rgba(255,255,255,0.92)' : c.surface;
        const fg = onDark ? (active ? '#1A1815' : '#F5F0E6') : active ? c.text : c.textMuted;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: activeBg }]}
          >
            <Text style={[type.label, { color: fg }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TextField({
  label,
  hint,
  error,
  style,
  ...rest
}: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      {label ? (
        <AppText variant="label" muted>
          {label}
        </AppText>
      ) : null}
      <TextInput
        placeholderTextColor={c.textFaint}
        {...rest}
        style={[
          styles.input,
          { color: c.text, borderColor: error ? c.accent : c.hairline, backgroundColor: c.surface },
          style,
        ]}
      />
      {error ? (
        <AppText variant="small" color={c.accent}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" faint>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={c.textFaint} />
      <AppText variant="title" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      {body ? (
        <AppText muted style={{ textAlign: 'center', maxWidth: 320 }}>
          {body}
        </AppText>
      ) : null}
      {action ? <View style={{ marginTop: space.md, alignSelf: 'stretch', alignItems: 'center' }}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonCompact: { minHeight: HIT, paddingHorizontal: space.lg },
  iconButton: { minWidth: HIT, minHeight: HIT, alignItems: 'center', justifyContent: 'center' },
  row: {
    minHeight: 52,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.md - 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
  empty: { alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.xxl * 1.5 },
});
