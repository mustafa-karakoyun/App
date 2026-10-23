import Constants from 'expo-constants';

/**
 * Sunucu adresi. Öncelik: EXPO_PUBLIC_API_URL ortam değişkeni. Yoksa geliştirmede
 * Expo sunucusunun çalıştığı bilgisayarın IP'si (telefon ve bilgisayar aynı ağdaysa
 * ek ayar gerekmez), port 3000.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:3000`;
  return 'http://localhost:3000';
}

export const API_URL = resolveApiUrl();
