import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { ApiError, isOffline } from '@/lib/api';
import { signIn, signUp } from '@/lib/auth';
import { space, useTheme } from '@/theme';
import { useToast } from './Toast';
import { AppText, Button, TextField } from './ui';

export function AuthForm({ mode, reason }: { mode: 'login' | 'register'; reason?: string }) {
  const { c } = useTheme();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Geçerli bir e-posta adresi gir');
    if (password.length < 8) return setError('Şifre en az 8 karakter olmalı');
    setLoading(true);
    try {
      if (mode === 'login') await signIn(email.trim(), password);
      else await signUp(email.trim(), password, name.trim() || undefined);
      toast(mode === 'login' ? 'Giriş yapıldı, kütüphanen eşitleniyor' : 'Hesabın hazır, kütüphanen yedekleniyor');
      if (router.canGoBack()) router.back();
      else router.replace('/');
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
        {reason === 'scan' ? (
          <AppText muted>
            Raf tarama sunucuda yapıldığı için hesap gerekiyor. Hesabın aynı zamanda kütüphaneni yedekler.
          </AppText>
        ) : mode === 'register' ? (
          <AppText muted>
            Kütüphanen yedeklenir; telefon değişince kaybolmaz. Şu ana kadar eklediğin kitaplar da hesaba aktarılır.
          </AppText>
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
          secureTextEntry
          textContentType={mode === 'login' ? 'password' : 'newPassword'}
          hint={mode === 'register' ? 'En az 8 karakter' : undefined}
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        {error ? <AppText color={c.accent}>{error}</AppText> : null}
        <Button title={mode === 'login' ? 'Giriş yap' : 'Hesap oluştur'} onPress={submit} loading={loading} />
        <View style={{ alignItems: 'center' }}>
          <Button
            title={mode === 'login' ? 'Hesabın yok mu? Oluştur' : 'Zaten hesabın var mı? Giriş yap'}
            kind="ghost"
            compact
            onPress={() =>
              router.replace(
                mode === 'login'
                  ? { pathname: '/auth/register', params: { reason } }
                  : { pathname: '/auth/login', params: { reason } },
              )
            }
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
