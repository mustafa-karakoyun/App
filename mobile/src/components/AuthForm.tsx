import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { libraryCount } from '@/data/library';
import { ApiError, isOffline } from '@/lib/api';
import { signIn, signUp } from '@/lib/auth';
import { radius, space, useTheme } from '@/theme';
import { useToast } from './Toast';
import { AppText, Button, IconButton, LinkButton, Notice, TextField } from './ui';
import { goBack } from '@/lib/nav';

export function AuthForm({ mode, reason }: { mode: 'login' | 'register'; reason?: string }) {
  const { c } = useTheme();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Geçerli bir e-posta adresi gir');
    if (password.length < 8) return setError('Şifre en az 8 karakter olmalı');
    setLoading(true);
    try {
      if (mode === 'login') await signIn(email.trim(), password);
      else await signUp(email.trim(), password, name.trim() || undefined);
      toast(mode === 'login' ? 'Giriş yapıldı, kütüphanen eşitleniyor' : 'Hesabın hazır, kütüphanen yedekleniyor');
      goBack();
    } catch (err) {
      setError(
        isOffline(err)
          ? 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.'
          : err instanceof ApiError
            ? err.message
            : 'Bir şeyler ters gitti',
      );
    } finally {
      setLoading(false);
    }
  };

  const bookCount = mode === 'register' ? libraryCount() : 0;
  const switchLink = (
    <LinkButton
      title={mode === 'login' ? 'Hesabın yok mu? Hesap oluştur' : 'Zaten hesabın var mı? Giriş yap'}
      onPress={() =>
        router.replace(
          mode === 'login'
            ? { pathname: '/auth/register', params: { reason } }
            : { pathname: '/auth/login', params: { reason } },
        )
      }
    />
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerLeft: () => <LinkButton title="Vazgeç" color={c.primary} onPress={goBack} /> }} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 6 }}>
          <AppText variant="display" style={{ fontSize: 30, lineHeight: 36 }}>
            {mode === 'login' ? 'Giriş yap' : 'Hesap oluştur'}
          </AppText>
          {reason !== 'scan' ? (
            <AppText variant="sub" muted>
              {mode === 'login'
                ? 'Kitaplığın ve yedeğin seni bekliyor.'
                : 'Kitapların yedeklenir, telefon değişince kaybolmaz. Raf tarama da açılır.'}
            </AppText>
          ) : null}
        </View>
        {reason === 'scan' ? (
          <Notice icon="scan" tone="primary">
            Raf tarama sunucuda yapıldığı için hesap gerekiyor. Fotoğrafın seni bekliyor.
          </Notice>
        ) : null}
        {mode === 'register' && bookCount > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="checkmark" size={16} color={c.primary} />
            <AppText variant="small" color={c.primary} style={{ fontWeight: '600' }}>
              {`Şu ana kadar eklediğin ${bookCount} kitap da aktarılır`}
            </AppText>
          </View>
        ) : null}
        {mode === 'register' ? (
          <TextField
            label="Adın (isteğe bağlı)"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            textContentType="name"
          />
        ) : null}
        <TextField
          label="E-posta"
          value={email}
          onChangeText={setEmail}
          placeholder="ornek@eposta.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoFocus
        />
        <TextField
          label="Şifre"
          value={password}
          onChangeText={setPassword}
          placeholder="En az 8 karakter"
          secureTextEntry={!showPassword}
          textContentType={mode === 'login' ? 'password' : 'newPassword'}
          hint={mode === 'register' ? 'En az 8 karakter' : undefined}
          onSubmitEditing={submit}
          returnKeyType="go"
          right={
            <IconButton
              icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
              label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
              onPress={() => setShowPassword((v) => !v)}
              color={c.textFaint}
              size={20}
            />
          }
        />
        {error ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="alert-circle-outline" size={18} color={c.accent} />
            <AppText variant="secondary" color={c.accent} style={{ fontWeight: '600', flex: 1 }}>
              {error}
            </AppText>
          </View>
        ) : null}
        <Button
          title={mode === 'login' ? (reason === 'scan' ? 'Giriş yap ve tara' : 'Giriş yap') : 'Hesap oluştur'}
          onPress={submit}
          loading={loading}
        />
        <View style={{ gap: 4 }}>
          {/* Google ile giriş sunucuda hazır; istemci kütüphanesi development build istediği için kapalı. */}
          <View style={[styles.google, { borderColor: c.hairline }]} accessibilityState={{ disabled: true }}>
            <Ionicons name="logo-google" size={18} color={c.textFaint} />
            <AppText color={c.textFaint} style={{ fontWeight: '600' }}>
              Google ile devam et
            </AppText>
          </View>
          <AppText variant="small" faint style={{ textAlign: 'center', fontSize: 11 }}>
            yakında
          </AppText>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: 'center' }}>{switchLink}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  google: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
});
