import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { serif, SPINES, useTheme } from '@/theme';

function spineColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return SPINES[Math.abs(h) % SPINES.length]!;
}

/**
 * Kitap kapağı. Kapak yoksa başlıktan türetilen sırt renginde, solda koyu şeritli
 * ve sol üstte serif başlıklı bir yer tutucu; bilgisi bekleyen kitapta kitap simgesi.
 */
export function BookCover({
  uri,
  title,
  width,
  pending,
  badge,
}: {
  uri?: string | null;
  title: string;
  width: number;
  pending?: boolean;
  /** Kapağın sol altında küçük bordo etiket (ör. "Ödünçte"). */
  badge?: string | null;
}) {
  const { c } = useTheme();
  // Kapak adresi yüklenemezse (çevrimdışı ilk açılış, kırık bağlantı) yer tutucuya düş.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const height = Math.round(width * 1.5);
  const box = { width, height, borderRadius: 2 };
  const strip = <View style={[styles.strip, { width: Math.max(2, width * 0.07) }]} />;

  let content;
  if (uri && failedUri !== uri) {
    content = (
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
  } else if (pending) {
    content = (
      <View style={[box, styles.center, { backgroundColor: c.coverPending }]}>
        {strip}
        <Ionicons name="book-outline" size={Math.round(width * 0.36)} color={c.textFaint} />
      </View>
    );
  } else {
    const fontSize = Math.max(7, Math.round(width / 8.5));
    content = (
      <View style={[box, { backgroundColor: spineColor(title), overflow: 'hidden' }]}>
        {strip}
        <Text
          numberOfLines={4}
          style={[
            styles.title,
            {
              fontSize,
              lineHeight: Math.round(fontSize * 1.25),
              marginLeft: width * 0.13,
              marginTop: width * 0.12,
              marginRight: width * 0.06,
            },
          ]}
        >
          {title}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ width, height }}>
      {content}
      {badge ? (
        <View style={[styles.badge, { backgroundColor: c.accent }]}>
          <Text style={[styles.badgeText, { color: c.bg }]}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  strip: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.14)' },
  title: { color: '#F5F0E6', fontFamily: serif },
  badge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
});
