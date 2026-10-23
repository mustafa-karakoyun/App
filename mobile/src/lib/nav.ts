import { router } from 'expo-router';

/**
 * Bir önceki ekrana dön; geçmiş yoksa (bildirimden ya da bağlantıdan doğrudan
 * açılmış ekran) kütüphaneye git.
 */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
