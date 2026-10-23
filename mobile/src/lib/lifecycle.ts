import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { subscribe } from '@/db/changes';
import { pendingBooks } from '@/data/library';
import { processScanQueue } from '@/data/scans';
import { pendingChangeCount, scheduleSync, syncNow } from '@/data/sync';
import { useAuth } from './auth';

async function catchUp() {
  await syncNow();
  await processScanQueue();
}

/**
 * Senkronizasyonu tetikleyen olaylar: açılış, öne gelme, internetin geri gelmesi,
 * giriş yapılması ve yerel değişiklikler. Bildirime dokununca ilgili ekran açılır.
 */
export function useAppLifecycle() {
  const { ready, user } = useAuth();

  useEffect(() => {
    if (!ready) return;
    void catchUp();
  }, [ready, user?.id]);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') void catchUp();
    });
    let wasConnected = true;
    const net = Network.addNetworkStateListener((e) => {
      const connected = !!e.isConnected && e.isInternetReachable !== false;
      if (connected && !wasConnected) void catchUp();
      wasConnected = connected;
    });
    const unsubscribe = subscribe((tables) => {
      if (!tables.has('user_books') && !tables.has('locations') && !tables.has('loans') && !tables.has('books')) return;
      // Pull da değişiklik duyurur; gönderilecek bir şey yoksa yeni tur başlatma.
      if (pendingChangeCount() > 0 || pendingBooks().length > 0) scheduleSync();
    });
    return () => {
      appState.remove();
      net.remove();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url as never);
    };
    Notifications.getLastNotificationResponseAsync()
      .then(open)
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}
