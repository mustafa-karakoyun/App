import type { AuthResponse, AuthUser } from '@kitaplik/shared';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { httpError } from '../errors';

const credentialsSchema = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı').max(200),
});

const registerSchema = credentialsSchema.extend({
  name: z.string().trim().max(100).optional(),
});

interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  password_hash: string | null;
}

function toUser(row: UserRow): AuthUser {
  return { id: row.id, email: row.email ?? '', name: row.name };
}

export async function authRoutes(app: FastifyInstance, { db, config }: AppDeps) {
  const googleClientIds = (config.GOOGLE_CLIENT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const googleClient = googleClientIds.length ? new OAuth2Client() : null;

  const respond = (row: UserRow): AuthResponse => ({
    token: app.jwt.sign({ sub: row.id }, { expiresIn: '60d' }),
    user: toUser(row),
  });

  app.post('/auth/register', async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const hash = await bcrypt.hash(body.password, 10);
    const { rows } = await db.query<UserRow>(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING RETURNING id, email, name, password_hash`,
      [body.email, hash, body.name || null],
    );
    if (!rows[0]) throw httpError(409, 'email_taken', 'Bu e-posta adresiyle zaten bir hesap var');
    reply.code(201);
    return respond(rows[0]);
  });

  app.post('/auth/login', async (req) => {
    const body = credentialsSchema.parse(req.body);
    const { rows } = await db.query<UserRow>('SELECT id, email, name, password_hash FROM users WHERE email = $1', [
      body.email,
    ]);
    const row = rows[0];
    const ok = row?.password_hash ? await bcrypt.compare(body.password, row.password_hash) : false;
    if (!row || !ok) throw httpError(401, 'invalid_credentials', 'E-posta ya da şifre hatalı');
    return respond(row);
  });

  app.post('/auth/google', async (req) => {
    if (!googleClient) throw httpError(501, 'google_disabled', 'Google ile giriş henüz etkin değil');
    const { id_token } = z.object({ id_token: z.string().min(10) }).parse(req.body);
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: id_token, audience: googleClientIds });
      payload = ticket.getPayload();
    } catch {
      throw httpError(401, 'invalid_google_token', 'Google oturumu doğrulanamadı');
    }
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw httpError(401, 'invalid_google_token', 'Google hesabının e-postası doğrulanmamış');
    }
    const email = payload.email.toLowerCase();
    // Aynı e-postayla şifreli hesap varsa Google kimliği o hesaba bağlanır.
    const { rows } = await db.query<UserRow>(
      `INSERT INTO users (email, google_sub, name) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET google_sub = COALESCE(users.google_sub, EXCLUDED.google_sub)
       RETURNING id, email, name, password_hash`,
      [email, payload.sub, payload.name ?? null],
    );
    return respond(rows[0]!);
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (req) => {
    const { rows } = await db.query<UserRow>('SELECT id, email, name, password_hash FROM users WHERE id = $1', [
      req.user.sub,
    ]);
    if (!rows[0]) throw httpError(401, 'unauthorized', 'Oturum geçersiz');
    return toUser(rows[0]);
  });

  // Mağaza kuralları gereği uygulama içinden hesap silme.
  app.delete('/auth/me', { preHandler: app.authenticate }, async (req, reply) => {
    await db.query('DELETE FROM users WHERE id = $1', [req.user.sub]);
    reply.code(204);
  });
}
