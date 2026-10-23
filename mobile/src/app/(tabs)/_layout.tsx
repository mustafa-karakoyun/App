import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '@/components/ui';
import { useDbQuery } from '@/db/changes';
import { activeLoans } from '@/data/loans';
import { radius, space, type, useTheme } from '@/theme';

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Kütüphane', icon: 'library-outline', iconActive: 'library' },
  loans: { label: 'Ödünçte', icon: 'swap-horizontal-outline', iconActive: 'swap-horizontal' },
  profile: { label: 'Profil', icon: 'person-outline', iconActive: 'person' },
};

/** Alt menü: ikinci sırada büyük "Tara" düğmesi, uygulamanın ana eylemi. */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const overdue = useDbQuery(
    () => activeLoans().filter((l) => l.loan.dueAt && new Date(l.loan.dueAt) < new Date()).length,
    [],
    ['loans', 'user_books'],
  );

  const tab = (routeName: string) => {
    const index = state.routes.findIndex((r) => r.name === routeName);
    const route = state.routes[index]!;
    const focused = state.index === index;
    const meta = TABS[routeName]!;
    return (
      <Pressable
        key={routeName}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        }}
        style={styles.tab}
      >
        <View>
          <Ionicons name={focused ? meta.iconActive : meta.icon} size={24} color={focused ? c.primary : c.textMuted} />
          {routeName === 'loans' && overdue > 0 ? <View style={[styles.dot, { backgroundColor: c.accent, borderColor: c.bg }]} /> : null}
        </View>
        <Text style={[type.small, { color: focused ? c.primary : c.textMuted, fontWeight: focused ? '600' : '400' }]}>
          {meta.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { backgroundColor: c.bg, borderTopColor: c.hairline, paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      {tab('index')}
      <View style={styles.tab}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tara: raf, barkod ya da elle ekle"
          onPress={() => router.push('/scan')}
          style={({ pressed }) => [styles.scan, { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 }]}
        >
          <Ionicons name="scan" size={22} color={c.primaryText} />
          <Text style={[type.label, { color: c.primaryText }]}>Tara</Text>
        </Pressable>
      </View>
      {tab('loans')}
      {tab('profile')}
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
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 48 },
  scan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.lg,
    height: 44,
    borderRadius: radius.pill,
  },
  dot: { position: 'absolute', top: -2, right: -4, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});
