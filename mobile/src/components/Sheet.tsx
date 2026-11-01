import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, useTheme } from '@/theme';
import { AppText, IconButton } from './ui';

/** Alttan açılan sayfa: konum seçimi, ödünç verme gibi kısa görevler için. */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  closeButton = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | null;
  closeButton?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]}
          onPress={onClose}
          accessibilityLabel="Kapat"
        />
        <View style={styles.spacer} pointerEvents="box-none" />
        <View style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom + space.md }]}>
          <View style={[styles.grabber, { backgroundColor: c.hairline }]} />
          <View style={styles.header}>
            <View style={{ flex: 1, paddingTop: space.sm }}>
              <AppText variant="title">{title}</AppText>
              {subtitle ? (
                <AppText variant="small" muted numberOfLines={1}>
                  {subtitle}
                </AppText>
              ) : null}
            </View>
            {closeButton ? <IconButton icon="close" label="Kapat" onPress={onClose} color={c.textMuted} /> : null}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  spacer: { flex: 1 },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '88%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  grabber: { width: 40, height: 5, borderRadius: 2.5, alignSelf: 'center', marginTop: space.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: space.lg,
    paddingRight: space.sm,
    paddingBottom: space.md,
  },
});
