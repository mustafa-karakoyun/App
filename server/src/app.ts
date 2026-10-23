import { mkdirSync } from 'node:fs';
import path from 'node:path';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { authRoutes } from './auth/routes';
import type { BookProviders } from './books/providers';
import { bookRoutes } from './books/routes';
import type { Config } from './config';
import type { Db } from './db';
import { HttpError } from './errors';
import type { VisionProvider } from './scan/vision';
import { scanRoutes } from './scan/routes';
import { syncRoutes } from './sync/routes';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AppDeps {
  config: Config;
  db: Db;
  providers: BookProviders;
  vision: VisionProvider;
}

export async function buildApp(deps: AppDeps, opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger ?? false,
    // Raf fotoğrafları istemcide küçültülüyor; bu sınır yalnızca güvenlik payı.
    bodyLimit: 1024 * 1024,
  });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: deps.config.JWT_SECRET });
  await app.register(multipart, { limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
  const uploadRoot = path.resolve(deps.config.UPLOAD_DIR);
  mkdirSync(uploadRoot, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadRoot,
    prefix: '/uploads/',
    decorateReply: false,
  });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new HttpError(401, 'unauthorized', 'Oturum açman gerekiyor');
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message, ...err.extra });
    }
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return reply.code(400).send({
        error: 'validation',
        message: first ? `${first.path.join('.') || 'istek'}: ${first.message}` : 'Geçersiz istek',
      });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.code(status).send({ error: 'bad_request', message: (err as Error).message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'internal', message: 'Beklenmeyen bir hata oluştu' });
  });

  app.get('/health', async () => {
    await deps.db.query('SELECT 1');
    return { ok: true, vision: deps.vision.name };
  });

  await app.register(async (scope) => authRoutes(scope, deps));
  await app.register(async (scope) => bookRoutes(scope, deps));
  await app.register(async (scope) => scanRoutes(scope, deps));
  await app.register(async (scope) => syncRoutes(scope, deps));

  return app;
}
