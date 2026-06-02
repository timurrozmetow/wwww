import { Redis } from 'ioredis';
import { env } from '../config/env.js';

let client: Redis | undefined;

/**
 * Lazily-created shared Redis client (live VPN sessions, countdown, usage,
 * rate-limit — CLAUDE.md §14.3, run with AOF). `lazyConnect` means importing
 * this never dials Redis; tests that inject in-memory stores never touch it.
 */
export function getRedis(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  await client.quit().catch(() => client?.disconnect());
  client = undefined;
}
