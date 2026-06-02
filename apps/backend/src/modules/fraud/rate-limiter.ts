import type { Redis } from 'ioredis';
import { getRedis } from '../../lib/redis-client.js';

/**
 * Fixed-window counter for anti-fraud / abuse limiting (CLAUDE.md §9, §14.3 —
 * rate-limit counters live in Redis). `hit` increments the key's counter,
 * `peek` reads it without incrementing, and `firstSeen` is a one-shot guard
 * (so retried/replayed events don't re-count).
 */
export interface RateLimiter {
  hit(key: string, windowSeconds: number): Promise<number>;
  peek(key: string): Promise<number>;
  /** Sets `key` if absent; returns true only the first time within the TTL. */
  firstSeen(key: string, ttlSeconds: number): Promise<boolean>;
}

// A non-positive window must never disable the counter: Redis EXPIRE 0 deletes
// the key, so every hit would reset to 1 and the cap could never be exceeded.
const minWindow = (windowSeconds: number): number => Math.max(1, Math.floor(windowSeconds));

export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis = getRedis()) {}

  async hit(key: string, windowSeconds: number): Promise<number> {
    const k = `rl:${key}`;
    const count = await this.redis.incr(k);
    // TTL only on creation, so the window is fixed (not sliding) and a burst
    // can't keep pushing the expiry out.
    if (count === 1) await this.redis.expire(k, minWindow(windowSeconds));
    return count;
  }

  async peek(key: string): Promise<number> {
    const raw = await this.redis.get(`rl:${key}`);
    return raw ? Number(raw) : 0;
  }

  async firstSeen(key: string, ttlSeconds: number): Promise<boolean> {
    const res = await this.redis.set(`seen:${key}`, '1', 'EX', minWindow(ttlSeconds), 'NX');
    return res === 'OK';
  }
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAtMs: number }>();
  private readonly seen = new Map<string, number>();

  async hit(key: string, windowSeconds: number): Promise<number> {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAtMs <= now) {
      this.buckets.set(key, { count: 1, resetAtMs: now + minWindow(windowSeconds) * 1000 });
      return 1;
    }
    bucket.count += 1;
    return bucket.count;
  }

  async peek(key: string): Promise<number> {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAtMs <= Date.now()) return 0;
    return bucket.count;
  }

  async firstSeen(key: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const expiry = this.seen.get(key);
    if (expiry !== undefined && expiry > now) return false;
    this.seen.set(key, now + minWindow(ttlSeconds) * 1000);
    return true;
  }
}
