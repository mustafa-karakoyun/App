import type { AuthResponse, AuthUser } from '@kitaplik/shared';
import { useSyncExternalStore } from 'react';
import { getKv, setKv } from '@/data/kv';
import { api, setApiToken, setUnauthorizedHandler } from './api';
import { getSecure, setSecure } from './storage';

// Hesap isteğe bağlı: uygulama hesapsız tam çalışır, hesap yedek ve cihazlar arası senkron içindir.
const TOKEN_KEY = 'kitaplik.token';

interface AuthState {
  ready: boolean;
  user: AuthUser | null;
}

let state: AuthState = { ready: false, user: null };
const listeners = new Set<() => void>();

function setState(next: AuthState) {
  state = next;
  for (const l of listeners) l();
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function currentUser() {
  return state.user;
}

export async function restoreSession() {
  const token = await getSecure(TOKEN_KEY);
  const cached = getKv('auth.user');
  setApiToken(token);
  setUnauthorizedHandler(() => {
    void signOut();
  });
  setState({ ready: true, user: token && cached ? (JSON.parse(cached) as AuthUser) : null });
}

async function applySession(res: AuthResponse) {
  await setSecure(TOKEN_KEY, res.token);
  setApiToken(res.token);
  // Farklı bir hesaba geçildiyse o hesabın tüm verisini baştan çek.
  if (getKv('auth.user_id') !== res.user.id) setKv('sync.last_pull', null);
  setKv('auth.user_id', res.user.id);
  setKv('auth.user', JSON.stringify(res.user));
  setState({ ready: true, user: res.user });
}

export async function signIn(email: string, password: string) {
  await applySession(await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }));
}

export async function signUp(email: string, password: string, name?: string) {
  await applySession(await api<AuthResponse>('/auth/register', { method: 'POST', body: { email, password, name } }));
}

export async function signInWithGoogle(idToken: string) {
  await applySession(await api<AuthResponse>('/auth/google', { method: 'POST', body: { id_token: idToken } }));
}

export async function signOut() {
  await setSecure(TOKEN_KEY, null);
  setApiToken(null);
  setKv('auth.user', null);
  setState({ ready: true, user: null });
}

export async function deleteAccount() {
  await api('/auth/me', { method: 'DELETE' });
  setKv('auth.user_id', null);
  setKv('sync.last_pull', null);
  await signOut();
}
