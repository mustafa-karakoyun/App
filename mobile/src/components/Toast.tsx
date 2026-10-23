import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, type, useTheme } from '@/theme';

interface ToastOptions {
  message: string;
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
          style={[styles.wrap, { bottom: insets.bottom + 84, opacity }]}
          accessibilityLiveRegion="polite"
        >
          <View style={[styles.toast, { backgroundColor: c.text }]}>
            <Text style={[type.body, { color: c.bg, flex: 1 }]}>{toast.message}</Text>
            {toast.actionLabel ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => {
                  toast.onAction?.();
                  hide();
                }}
              >
                <Text style={[type.label, { color: c.primarySoft, fontSize: 15 }]}>{toast.actionLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  toast: {
    maxWidth: 520,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 2,
    borderRadius: radius.md,
  },
});
