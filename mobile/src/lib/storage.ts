import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Oturum anahtarı güvenli depoda; web'de (yalnızca geliştirme önizlemesi) localStorage.
export async function getSecure(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setSecure(key: string, value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
    } catch {
      // Gizli pencerede depolama kapalı olabilir; oturum yalnızca bellekte kalır.
    }
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}
