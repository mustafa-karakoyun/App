import { Platform, useColorScheme } from 'react-native';

// Kağıt tonları üzerinde koyu yeşil (ana eylem) ve bordo (uyarı, geciken iade).
// Kart yığını yok: içerik zemin üzerinde, ince ayırıcılarla gruplanır.
const light = {
  bg: '#F5F0E6',
  bgSunken: '#EDE6D8',
  surface: '#FAF7F0',
  text: '#2A2520',
  textMuted: '#6F665A',
  textFaint: '#9A9083',
  hairline: '#DDD3C1',
  primary: '#2F4A3A',
  primaryText: '#F5F0E6',
  primarySoft: '#DCE5DC',
  accent: '#7A2E36',
  accentSoft: '#F0DCDA',
  warning: '#8A6116',
  overlay: 'rgba(20, 17, 14, 0.55)',
};

const dark: typeof light = {
  bg: '#1A1815',
  bgSunken: '#141210',
  surface: '#221F1B',
  text: '#ECE5D8',
  textMuted: '#B0A696',
  textFaint: '#7D7466',
  hairline: '#353029',
  primary: '#9DBFA8',
  primaryText: '#16201A',
  primarySoft: '#26332B',
  accent: '#D9959B',
  accentSoft: '#3A2426',
  warning: '#D9B26A',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export type Colors = typeof light;

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' });

export const type = {
  display: { fontFamily: serif, fontSize: 30, lineHeight: 36, fontWeight: '600' as const },
  title: { fontFamily: serif, fontSize: 21, lineHeight: 27, fontWeight: '600' as const },
  bookTitle: { fontFamily: serif, fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 22 },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '500' as const },
  small: { fontSize: 13, lineHeight: 18 },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 0.8 },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

/** Dokunma hedefleri en az 44pt. */
export const HIT = 44;

export function useTheme() {
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  return { c, dark: scheme === 'dark' };
}
