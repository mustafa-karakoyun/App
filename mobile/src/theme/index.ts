import { Platform, useColorScheme } from 'react-native';

// Tasarım: "Kitaplık Ekran Spesifikasyonu". Kağıt tonları üzerinde koyu yeşil (ana
// eylem) ve bordo (uyarı, geciken iade). Kart yok: içerik zemin üzerinde, gruplar
// ince çizgi ve bölüm başlıklarıyla ayrılır.
const light = {
  bg: '#F5F0E6',
  bgSunken: '#EDE6D8',
  surface: '#FAF7F0',
  text: '#2A2520',
  textMuted: '#6F665A',
  // Brifteki #9A9083 kağıt zeminde AA altında kalıyordu; tasarım bunu koyulaştırdı.
  textFaint: '#8E8477',
  hairline: '#DDD3C1',
  primary: '#2F4A3A',
  primaryText: '#F5F0E6',
  primarySoft: '#E3E6DA',
  accent: '#7A2E36',
  accentSoft: '#F1E1DE',
  warning: '#8A6116',
  warningSoft: '#F1E6CF',
  toastBg: '#2A2520',
  toastText: '#F5F0E6',
  toastAction: '#9DBFA8',
  coverPending: '#CFC7B8',
  overlay: 'rgba(0, 0, 0, 0.32)',
};

const dark: typeof light = {
  bg: '#1A1815',
  bgSunken: '#25221E',
  surface: '#2C2823',
  text: '#ECE5D8',
  textMuted: '#B3A998',
  textFaint: '#968C7D',
  hairline: '#3A352E',
  primary: '#9DBFA8',
  primaryText: '#1A1815',
  primarySoft: '#26302A',
  accent: '#D9959B',
  accentSoft: '#3A2427',
  warning: '#D9B66E',
  warningSoft: '#37301F',
  toastBg: '#ECE5D8',
  toastText: '#1A1815',
  toastAction: '#2F4A3A',
  coverPending: '#3A3630',
  overlay: 'rgba(0, 0, 0, 0.55)',
};

export type Colors = typeof light;

/** Kamera ekranları her iki temada da koyu. */
export const cam = {
  bg: '#0F0E0C',
  text: '#F5F0E6',
  muted: '#BDB3A3',
  segment: '#2A2621',
  success: '#9DBFA8',
  errorBand: '#3A2427',
  error: '#D9959B',
  scrim: 'rgba(15,14,12,0.8)',
  button: 'rgba(0,0,0,0.35)',
};

/** Kapaksız kitaplar için başlıktan türetilen sırt renkleri. */
export const SPINES = ['#5F6F5C', '#8A6A50', '#56677A', '#7A5560', '#857A55', '#5A7370', '#706488', '#91694F'];

// Figma'da Lora; uygulamada iOS'ta Georgia, Android'de sistem serif'i.
export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Lora, Georgia, serif' });

export const type = {
  display: { fontFamily: serif, fontSize: 32, lineHeight: 38, fontWeight: '600' as const },
  heading: { fontFamily: serif, fontSize: 28, lineHeight: 34, fontWeight: '600' as const },
  emptyTitle: { fontFamily: serif, fontSize: 26, lineHeight: 32, fontWeight: '600' as const },
  detailTitle: { fontFamily: serif, fontSize: 24, lineHeight: 29, fontWeight: '600' as const },
  title: { fontFamily: serif, fontSize: 22, lineHeight: 28, fontWeight: '600' as const },
  cardTitle: { fontFamily: serif, fontSize: 20, lineHeight: 24, fontWeight: '600' as const },
  bookTitle: { fontFamily: serif, fontSize: 17, lineHeight: 21, fontWeight: '600' as const },
  serifBody: { fontFamily: serif, fontSize: 15, lineHeight: 20 },
  quote: { fontFamily: serif, fontSize: 16, lineHeight: 22, fontStyle: 'italic' as const },
  body: { fontSize: 16, lineHeight: 22 },
  button: { fontSize: 16, lineHeight: 20, fontWeight: '600' as const },
  sub: { fontSize: 15, lineHeight: 21 },
  secondary: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '500' as const },
  small: { fontSize: 13, lineHeight: 18 },
  fieldLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 1.2 },
  spine: { fontSize: 12, lineHeight: 16, letterSpacing: 0.3 },
  tab: { fontSize: 11, lineHeight: 14, fontWeight: '500' as const },
};

/** Kenar boşluğu 20 · satır içi 12 · bölüm arası 32. */
export const space = { xs: 4, sm: 8, md: 12, lg: 20, xl: 24, xxl: 32 };
export const radius = { sm: 6, seg: 10, md: 12, lg: 16, pill: 999 };

/** Dokunma hedefleri en az 44pt. */
export const HIT = 44;

export function useTheme() {
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  return { c, dark: scheme === 'dark' };
}
