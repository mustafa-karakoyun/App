import type { ApiError as ApiErrorBody } from '@kitaplik/shared';
import { API_URL } from './config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Sunucuya ulaşılamadı (internet yok, sunucu kapalı, zaman aşımı). */
export class NetworkError extends Error {
  constructor(message = 'Sunucuya ulaşılamadı') {
    super(message);
  }
}

export function isOffline(err: unknown): err is NetworkError {
  return err instanceof NetworkError;
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setApiToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  form?: FormData;
  timeoutMs?: number;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  let res: Response;
  try {
    res = await fetch(API_URL + path, { method: opts.method ?? 'GET', headers, body, signal: controller.signal });
  } catch {
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    // Sunucu JSON dışında bir şey döndürdüyse (ör. vekil sunucu hata sayfası).
  }
  if (!res.ok) {
    const err = (json ?? {}) as Partial<ApiErrorBody> & Record<string, unknown>;
    if (res.status === 401 && authToken) onUnauthorized?.();
    throw new ApiError(res.status, err.error ?? 'http_error', err.message ?? `Sunucu hatası (${res.status})`, err);
  }
  return json as T;
}

/** Yerel dosyayı (kamera çıktısı) multipart ile gönderilebilir hale getirir. */
export async function fileFormData(field: string, uri: string, name: string): Promise<FormData> {
  const form = new FormData();
  if (uri.startsWith('blob:') || uri.startsWith('data:')) {
    // Web: dosya bir blob URL'si.
    const blob = await (await fetch(uri)).blob();
    form.append(field, blob, name);
  } else {
    // React Native'in FormData'sı { uri, name, type } nesnesini dosya olarak gönderir.
    form.append(field, { uri, name, type: 'image/jpeg' } as unknown as Blob);
  }
  return form;
}
