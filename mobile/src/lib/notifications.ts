import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Ödünç hatırlatmaları ve kuyruktaki raf taramaları yerel bildirimle gelir; sunucu gerekmez.
const CHANNEL = 'reminders';
let configured = false;

export function configureNotifications() {
  if (configured || Platform.OS === 'web') return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Hatırlatmalar',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {});
  }
}

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** İade gününün sabahı (10:00) hatırlatma kurar. Geçmiş bir tarihse kurmaz. */
export async function scheduleLoanReminder(opts: {
  dueAt: string;
  bookTitle: string;
  borrower: string;
  userBookId: string;
}): Promise<string | null> {
  const due = new Date(opts.dueAt);
  due.setHours(10, 0, 0, 0);
  if (due.getTime() <= Date.now() + 60_000) return null;
  if (!(await ensurePermission())) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'İade günü',
        body: `${opts.borrower}, "${opts.bookTitle}" kitabını bugün geri getirecekti.`,
        data: { url: `/book/${opts.userBookId}` },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: due, channelId: CHANNEL },
    });
  } catch {
    return null;
  }
}

export async function cancelReminder(id: string) {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

export async function notifyNow(title: string, body: string, url?: string) {
  if (!(await ensurePermission())) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: url ? { url } : {} },
    trigger: null,
  }).catch(() => {});
}
