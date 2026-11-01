import { Ionicons } from '@expo/vector-icons';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, type, useTheme } from '@/theme';

interface ToastOptions {
  message: string;
  /** İsteğe bağlı kalın ilk satır (ör. "İnternet yok gibi görünüyor."). */
  title?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

const ToastContext = createContext<(opts: ToastOptions | string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

/** Ekranın altında kısa geri bildirim; "Geri al" gibi tek bir eylem taşıyabilir. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setToast(null));
  }, [opacity]);

  const show = useCallback(
    (opts: ToastOptions | string) => {
      const o = typeof opts === 'string' ? { message: opts } : opts;
      if (timer.current) clearTimeout(timer.current);
      setToast(o);
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, o.durationMs ?? (o.actionLabel ? 5000 : 2800));
    },
    [hide, opacity],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { bottom: Math.max(insets.bottom, 8) + 76 + 16, opacity }]}
          accessibilityLiveRegion="polite"
        >
          <View style={[styles.toast, { backgroundColor: c.toastBg }]}>
            {toast.icon ? (
              <Ionicons name={toast.icon} size={20} color={c.toastText} style={{ alignSelf: 'flex-start' }} />
            ) : null}
            <View style={{ flex: 1 }}>
              {toast.title ? (
                <Text style={[type.label, { color: c.toastText, fontWeight: '700' }]}>{toast.title}</Text>
              ) : null}
              <Text style={[type.label, { color: c.toastText }]}>{toast.message}</Text>
            </View>
            {toast.actionLabel ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => {
                  toast.onAction?.();
                  hide();
                }}
              >
                <Text style={[type.label, { color: c.toastAction, fontWeight: '700', alignSelf: 'flex-end' }]}>
                  {toast.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    maxWidth: 520,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg - 4,
    paddingVertical: 14,
    minHeight: 50,
    borderRadius: radius.md,
  },
});
