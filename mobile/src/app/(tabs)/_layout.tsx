import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '@/components/ui';
import { useDbQuery } from '@/db/changes';
import { activeLoans } from '@/data/loans';
import { type, useTheme } from '@/theme';

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Kütüphane', icon: 'library-outline', iconActive: 'library' },
  loans: { label: 'Ödünçte', icon: 'swap-horizontal-outline', iconActive: 'swap-horizontal' },
  profile: { label: 'Profil', icon: 'person-outline', iconActive: 'person' },
};

const SCAN_SIZE = 62;

/**
 * Alt menü: Kütüphane | ● Tara ● | Ödünçte | Profil. Tara ekranın tam ortasında,
 * menüden yukarı taşan yeşil daire; başparmakla kolay ulaşılır.
 */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const overdue = useDbQuery(
    () => activeLoans().filter((l) => l.loan.dueAt && new Date(l.loan.dueAt) < new Date()).length,
    [],
    ['loans', 'user_books'],
  );

  const tab = (routeName: string, flex: number) => {
    const index = state.routes.findIndex((r) => r.name === routeName);
    const route = state.routes[index]!;
    const focused = state.index === index;
    const meta = TABS[routeName]!;
    return (
      <Pressable
        key={routeName}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={routeName === 'loans' && overdue > 0 ? `${meta.label}, iadesi geciken var` : meta.label}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        }}
        style={[styles.tab, { flex }]}
      >
        <View>
          <Ionicons name={focused ? meta.iconActive : meta.icon} size={24} color={focused ? c.primary : c.textMuted} />
          {routeName === 'loans' && overdue > 0 ? (
            <View style={[styles.dot, { backgroundColor: c.accent, borderColor: c.bg }]} />
          ) : null}
        </View>
        <Text style={[type.tab, { color: focused ? c.primary : c.textMuted, fontWeight: focused ? '600' : '500' }]}>
          {meta.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: c.bg, borderTopColor: c.hairline, paddingBottom: Math.max(insets.bottom, 8) },
      ]}
    >
      {tab('index', 2)}
      <View style={[styles.tab, { width: 90, flex: 0 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tara: raf, barkod ya da elle ekle"
          onPress={() => router.push('/scan')}
          style={({ pressed }) => [
            styles.scan,
            { backgroundColor: c.primary, borderColor: c.bg, transform: [{ scale: pressed ? 0.95 : 1 }] },
          ]}
        >
          <Ionicons name="scan" size={28} color={c.primaryText} />
        </Pressable>
        <Text style={[type.tab, styles.scanLabel, { color: c.primary }]}>Tara</Text>
      </View>
      {tab('loans', 1)}
      {tab('profile', 1)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="loans" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, minHeight: 76 },
  tab: { alignItems: 'center', justifyContent: 'flex-start', gap: 3, minHeight: 48 },
  scan: {
    position: 'absolute',
    top: -36,
    width: SCAN_SIZE + 10,
    height: SCAN_SIZE + 10,
    borderRadius: (SCAN_SIZE + 10) / 2,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLabel: { marginTop: 27, fontWeight: '700' },
  dot: { position: 'absolute', top: -2, right: -4, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});
