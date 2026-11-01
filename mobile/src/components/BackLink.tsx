import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/theme';
import { AppText } from './ui';

/** Geri bağlantısı: ekranın nereden açıldığını söyler ("‹ Kütüphane", "‹ Ödünçte"). */
export function BackLink({ label }: { label: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ekranına dön`}
      onPress={goBack}
      hitSlop={10}
      style={styles.back}
    >
      <Ionicons name="chevron-back" size={24} color={c.primary} />
      <AppText color={c.primary} style={{ fontSize: 16 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', marginLeft: -6 },
});
