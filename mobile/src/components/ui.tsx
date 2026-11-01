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
import { cam, HIT, radius, space, type, useTheme } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type Variant = keyof typeof type;

export function AppText({
  variant = 'body',
  muted,
  faint,
  color,
  style,
  children,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean; faint?: boolean; color?: string }) {
  const { c } = useTheme();
  const tone = color ?? (faint ? c.textFaint : muted ? c.textMuted : c.text);
  const content = variant === 'overline' && typeof children === 'string' ? turkishUpper(children) : children;
  return (
    <Text {...rest} style={[type[variant] as TextStyle, { color: tone }, style]}>
      {content}
    </Text>
  );
}

export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.hairline, marginLeft: inset }, style]} />;
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'onDark' | 'onDarkPrimary';

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
    // Kamera gibi koyu zeminlerde.
    onDark: { bg: 'transparent', fg: cam.text, border: cam.text },
    onDarkPrimary: { bg: cam.text, fg: cam.bg, border: cam.text },
  };
  // Pasif birincil düğme: soluk zemin, soluk metin (tasarımdaki "Eklenecek kitap seç").
  const p = disabled && kind === 'primary' ? { bg: c.bgSunken, fg: c.textFaint, border: c.bgSunken } : palette[kind];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        {
          backgroundColor: p.bg,
          borderColor: p.border,
          opacity: disabled && kind !== 'primary' ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={p.fg} /> : null}
          <Text style={[type.button, { color: p.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Hap düğme: "Geri geldi", "Alıntı ekle" gibi satır içi küçük eylemler. */
export function PillButton({
  title,
  onPress,
  icon,
  strong,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  /** Birincil renkte kenar; yoksa ince çizgi. */
  strong?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: strong ? c.primary : c.hairline, opacity: pressed ? 0.6 : 1 },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={16} color={c.primary} /> : null}
      <Text style={[type.label, { color: strong ? c.primary : c.text, fontWeight: '600' }]}>{title}</Text>
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

/** Metin düğmesi: "Filtreleri temizle", "Tümünü seç", "Başka bir kitap ›". */
export function LinkButton({
  title,
  onPress,
  color,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  color?: string;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const tone = color ?? c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [styles.link, { opacity: pressed ? 0.5 : 1 }, style]}
    >
      {icon ? <Ionicons name={icon} size={18} color={tone} /> : null}
      <Text style={[type.label, { color: tone, fontWeight: '600', fontSize: 15 }]}>{title}</Text>
    </Pressable>
  );
}

/**
 * Bilgi satırı: sol simge, etiket (ve alt metin), sağda değer ve ok.
 * Kart yerine zemin üzerinde, altında ince çizgi.
 */
export function Row({
  title,
  subtitle,
  subtitleColor,
  value,
  icon,
  iconColor,
  onPress,
  danger,
  right,
  chevron = !!onPress,
  subtitleLines = 2,
  strong,
}: {
  title: string;
  subtitle?: string | null;
  subtitleColor?: string;
  subtitleLines?: number;
  value?: string | null;
  icon?: IconName;
  iconColor?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: ReactNode;
  chevron?: boolean;
  /** Başlık kalın (ör. "Ayşe'de"). */
  strong?: boolean;
}) {
  const { c } = useTheme();
  const tone = danger ? c.accent : c.text;
  const main = (
    <>
      {icon ? (
        <Ionicons name={icon} size={22} color={iconColor ?? (danger ? c.accent : c.textMuted)} style={{ width: 22 }} />
      ) : null}
      <View style={{ flex: 1 }}>
        <AppText color={tone} style={strong ? { fontWeight: '600' } : undefined}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="small" color={subtitleColor ?? c.textMuted} numberOfLines={subtitleLines}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="sub" muted numberOfLines={1} style={{ maxWidth: '55%', textAlign: 'right' }}>
          {value}
        </AppText>
      ) : null}
    </>
  );
  // Sağdaki eylem (ör. "Geri geldi") satırın dokunma alanının içinde olmasın: ayrı odaklanabilsin.
  if (right) {
    return (
      <View style={[styles.row, { paddingVertical: 0 }]}>
        <Pressable
          accessibilityRole={onPress ? 'button' : undefined}
          onPress={onPress}
          disabled={!onPress}
          style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.6 : 1 }]}
        >
          {main}
        </Pressable>
        {right}
        {chevron ? <Ionicons name="chevron-forward" size={20} color={c.textMuted} /> : null}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.bgSunken : 'transparent' }]}
    >
      {main}
      {chevron ? <Ionicons name="chevron-forward" size={20} color={c.textMuted} /> : null}
    </Pressable>
  );
}

/** CSS/RN textTransform Türkçe i/ı ayrımını bilmez ("Gizlilik" → "GIZLILIK"); elle çevir. */
export function turkishUpper(text: string): string {
  return text.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
}

export function SectionLabel({
  children,
  style,
  color,
  right,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  color?: string;
  right?: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.section, style]}>
      <AppText variant="overline" color={color ?? c.textMuted} style={{ flex: 1 }}>
        {children}
      </AppText>
      {right}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  count,
  removable,
  filled,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
  count?: number;
  /** Seçiliyken sağda × gösterir (aktif filtre). */
  removable?: boolean;
  /** Seçili değilken soluk dolgu (kişi çipleri, hızlı başla). */
  filled?: boolean;
}) {
  const { c } = useTheme();
  const fg = selected ? c.primaryText : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={removable && selected ? `${label} filtresini kaldır` : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.primary : filled ? c.bgSunken : 'transparent',
          borderColor: selected ? c.primary : filled ? c.bgSunken : c.hairline,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={16} color={selected ? c.primaryText : c.textMuted} /> : null}
      <Text style={[type.label, { color: fg }]}>{label}</Text>
      {count !== undefined ? (
        <Text style={[type.small, { color: selected ? c.primaryText : c.textFaint, fontWeight: '500' }]}>{count}</Text>
      ) : null}
      {removable && selected ? <Ionicons name="close" size={16} color={c.primaryText} /> : null}
    </Pressable>
  );
}

/** Birbirini dışlayan seçenekler (okuma durumu, tarama modu). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  onDark,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  onDark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const track = onDark ? cam.segment : c.bgSunken;
  return (
    <View style={[styles.segmented, { backgroundColor: track }, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        const activeBg = onDark ? cam.text : c.surface;
        const fg = onDark ? (active ? cam.bg : cam.text) : active ? c.text : c.textMuted;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[
              styles.segment,
              active && {
                backgroundColor: activeBg,
                borderColor: onDark ? activeBg : c.hairline,
                borderWidth: onDark ? 0 : 0.5,
              },
            ]}
          >
            <Text style={[type.small, { color: fg, fontWeight: active ? '600' : '500' }]} numberOfLines={1}>
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
  right,
  ...rest
}: TextInputProps & { label?: string; hint?: string | null; error?: string | null; right?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <AppText variant="fieldLabel" muted>
          {label}
        </AppText>
      ) : null}
      <View>
        <TextInput
          placeholderTextColor={c.textFaint}
          {...rest}
          style={[
            styles.input,
            {
              color: c.text,
              borderColor: error ? c.accent : c.hairline,
              borderWidth: error ? 1.6 : 1,
              backgroundColor: c.surface,
              paddingRight: right ? 44 : space.md,
            },
            style,
          ]}
        />
        {right ? <View style={styles.inputRight}>{right}</View> : null}
      </View>
      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="alert-circle-outline" size={16} color={c.accent} />
          <AppText variant="small" color={c.accent}>
            {error}
          </AppText>
        </View>
      ) : hint ? (
        <AppText variant="small" faint>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

/** Soluk zeminli bilgi kutusu (bekleyen kitap, giriş bağlamı, bulundu bandı). */
export function Notice({
  icon,
  tone = 'warning',
  children,
  action,
  style,
}: {
  icon?: IconName;
  tone?: 'warning' | 'primary' | 'accent';
  children: ReactNode;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = tone === 'primary' ? c.primarySoft : tone === 'accent' ? c.accentSoft : c.warningSoft;
  const fg = tone === 'primary' ? c.primary : tone === 'accent' ? c.accent : c.warning;
  return (
    <View style={[styles.notice, { backgroundColor: bg }, style]}>
      {icon ? <Ionicons name={icon} size={20} color={fg} style={{ marginTop: 1 }} /> : null}
      <View style={{ flex: 1, gap: 6 }}>
        {typeof children === 'string' ? <AppText variant="small">{children}</AppText> : children}
        {action}
      </View>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  illustration,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
  illustration?: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.empty}>
      {illustration ?? (icon ? <Ionicons name={icon} size={44} color={c.textFaint} /> : null)}
      <AppText variant="emptyTitle" style={{ textAlign: 'center', fontSize: illustration ? 26 : 22 }}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="sub" muted style={{ textAlign: 'center', maxWidth: 330 }}>
          {body}
        </AppText>
      ) : null}
      {action ? (
        <View style={{ marginTop: space.sm, alignSelf: 'stretch', alignItems: 'center', gap: space.md }}>{action}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    borderWidth: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  buttonCompact: { minHeight: 40, paddingHorizontal: space.lg },
  pill: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  iconButton: { minWidth: HIT, minHeight: HIT, alignItems: 'center', justifyContent: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  row: {
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    minHeight: 56,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.sm,
  },
  chip: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmented: { flexDirection: 'row', borderRadius: radius.seg, padding: 3, minHeight: 36 },
  segment: {
    flex: 1,
    minHeight: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
  inputRight: { position: 'absolute', right: 6, top: 0, bottom: 0, justifyContent: 'center' },
  notice: { flexDirection: 'row', gap: space.sm, padding: 14, borderRadius: radius.md },
  empty: { alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.xxl * 1.5 },
});
