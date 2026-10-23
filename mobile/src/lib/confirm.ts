import { Alert, Platform } from 'react-native';

/** Onay penceresi; web önizlemesinde tarayıcının confirm'ünü kullanır. */
export function confirm(opts: { title: string; message?: string; confirmLabel: string; destructive?: boolean }): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(`${opts.title}${opts.message ? `\n\n${opts.message}` : ''}`) ?? true);
  }
  return new Promise((resolve) => {
    Alert.alert(opts.title, opts.message, [
      { text: 'Vazgeç', style: 'cancel', onPress: () => resolve(false) },
      { text: opts.confirmLabel, style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}
