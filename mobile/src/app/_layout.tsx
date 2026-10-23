import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '@/components/Toast';
import { AppText } from '@/components/ui';
import { db } from '@/db/client';
import migrations from '@/db/migrations';
import { restoreSession, useAuth } from '@/lib/auth';
import { useAppLifecycle } from '@/lib/lifecycle';
import { configureNotifications } from '@/lib/notifications';
import { space, useTheme } from '@/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000 } },
});

configureNotifications();

function Lifecycle() {
  useAppLifecycle();
  return null;
}

export default function RootLayout() {
  const { c, dark } = useTheme();
  const migration = useMigrations(db, migrations);
  const { ready } = useAuth();

  useEffect(() => {
    if (migration.success) void restoreSession();
  }, [migration.success]);

  const navTheme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(dark ? DarkTheme : DefaultTheme).colors,
      background: c.bg,
      card: c.bg,
      text: c.text,
      border: c.hairline,
      primary: c.primary,
      notification: c.accent,
    },
  };

  if (migration.error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, backgroundColor: c.bg }}>
        <AppText variant="title">Veri tabanı açılamadı</AppText>
        <AppText muted>{migration.error.message}</AppText>
      </View>
    );
  }
  if (!migration.success || !ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={navTheme}>
          <ToastProvider>
            <Lifecycle />
            <StatusBar style={dark ? 'light' : 'dark'} />
            <Stack
              screenOptions={{
                headerShadowVisible: false,
                headerStyle: { backgroundColor: c.bg },
                headerTintColor: c.primary,
                headerTitleStyle: { color: c.text },
                headerBackButtonDisplayMode: 'minimal',
                contentStyle: { backgroundColor: c.bg },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="scan/index" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="scan/review" options={{ title: 'Onay listesi' }} />
              <Stack.Screen name="book/[id]" options={{ title: '' }} />
              <Stack.Screen name="book/add" options={{ title: 'Elle ekle', presentation: 'modal' }} />
              <Stack.Screen name="locations" options={{ title: 'Konumlar' }} />
              <Stack.Screen name="auth/login" options={{ title: 'Giriş yap', presentation: 'modal' }} />
              <Stack.Screen name="auth/register" options={{ title: 'Hesap oluştur', presentation: 'modal' }} />
            </Stack>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
