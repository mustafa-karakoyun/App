import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme';

// Kapağı olmayan kitaplar için başlıktan türetilen sakin bir sırt rengi: liste düzenli görünsün.
const SPINES = ['#5B6B57', '#7A5A45', '#4E5D6C', '#6F4E55', '#7B6F4A', '#4F6461', '#68566F', '#80634A'];

function spineColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return SPINES[Math.abs(h) % SPINES.length]!;
}

export function BookCover({
  uri,
  title,
  width,
  pending,
}: {
  uri?: string | null;
  title: string;
  width: number;
  pending?: boolean;
}) {
  const { c } = useTheme();
  // Kapak adresi yüklenemezse (çevrimdışı ilk açılış, kırık bağlantı) yer tutucuya düş.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const height = Math.round(width * 1.5);
  const box = { width, height, borderRadius: Math.max(3, width / 16) };
  if (uri && failedUri !== uri) {
    return (
      <Image
        source={{ uri }}
        style={[box, { backgroundColor: c.bgSunken }]}
        contentFit="cover"
        transition={150}
        cachePolicy="disk"
        onError={() => setFailedUri(uri)}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={[box, styles.placeholder, { backgroundColor: pending ? c.textFaint : spineColor(title) }]}>
      {width >= 56 ? (
        <Text numberOfLines={4} style={[styles.title, { fontSize: Math.max(10, width / 8) }]}>
          {title}
        </Text>
      ) : (
        <View style={styles.band} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { justifyContent: 'center', alignItems: 'center', padding: 6, overflow: 'hidden' },
  title: { color: 'rgba(255,255,255,0.92)', textAlign: 'center', fontWeight: '600' },
  band: { width: '70%', height: 2, backgroundColor: 'rgba(255,255,255,0.5)' },
});
