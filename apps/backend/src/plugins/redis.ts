import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

/**
 * Registers a single shared ioredis client.
 *
 * `lazyConnect` means the client is created now but only dials on first use, so
 * importing the server (build, tests) never requires a running Redis. AOF
 * persistence is a *server-side* concern — see docker-compose.yml.
 */
export const redisPlugin = fp(
  async (app: FastifyInstance) => {
    const redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });

    redis.on('error', (err: Error) => {
      app.log.error({ err }, 'redis error');
    });

    app.decorate('redis', redis);
    app.addHook('onClose', async () => {
      await redis.quit().catch(() => redis.disconnect());
    });
  },
  { name: 'redis' },
);
