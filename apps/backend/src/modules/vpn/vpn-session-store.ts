import type { Redis } from 'ioredis';
import { getRedis } from '../../lib/redis-client.js';

/**
 * Live (hot) session state. Lives in Redis so heartbeats stay cheap and never
 * touch MySQL (CLAUDE.md §14.1) and so the countdown survives a restart (§14.3).
 */
export interface VpnLiveSession {
  sessionId: string;
  deviceId: string;
  serverId: string;
  token: string;
  startedAtMs: number;
  deadlineMs: number;
  allottedMinutes: number;
  bytesIn: number;
  bytesOut: number;
  lastHeartbeatMs: number;
}

export interface UsagePatch {
  bytesIn?: number;
  bytesOut?: number;
  lastHeartbeatMs: number;
}

export interface VpnSessionStore {
  put(session: VpnLiveSession): Promise<void>;
  get(sessionId: string): Promise<VpnLiveSession | null>;
  updateUsage(sessionId: string, patch: UsagePatch): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

const GRACE_SECONDS = 60;

export class RedisVpnSessionStore implements VpnSessionStore {
  constructor(private readonly redis: Redis = getRedis()) {}

  private key(sessionId: string): string {
    return `vpn:session:${sessionId}`;
  }

  async put(session: VpnLiveSession): Promise<void> {
    const ttl = Math.max(
      GRACE_SECONDS,
      Math.ceil((session.deadlineMs - Date.now()) / 1000) + GRACE_SECONDS,
    );
    await this.redis.set(this.key(session.sessionId), JSON.stringify(session), 'EX', ttl);
  }

  async get(sessionId: string): Promise<VpnLiveSession | null> {
    const raw = await this.redis.get(this.key(sessionId));
    return raw ? (JSON.parse(raw) as VpnLiveSession) : null;
  }

  async updateUsage(sessionId: string, patch: UsagePatch): Promise<void> {
    const current = await this.get(sessionId);
    if (!current) return;
    const next: VpnLiveSession = {
      ...current,
      bytesIn: patch.bytesIn ?? current.bytesIn,
      bytesOut: patch.bytesOut ?? current.bytesOut,
      lastHeartbeatMs: patch.lastHeartbeatMs,
    };
    await this.redis.set(this.key(sessionId), JSON.stringify(next), 'KEEPTTL');
  }

  async delete(sessionId: string): Promise<void> {
    await this.redis.del(this.key(sessionId));
  }
}

export class InMemoryVpnSessionStore implements VpnSessionStore {
  private readonly map = new Map<string, VpnLiveSession>();

  async put(session: VpnLiveSession): Promise<void> {
    this.map.set(session.sessionId, { ...session });
  }

  async get(sessionId: string): Promise<VpnLiveSession | null> {
    const s = this.map.get(sessionId);
    return s ? { ...s } : null;
  }

  async updateUsage(sessionId: string, patch: UsagePatch): Promise<void> {
    const current = this.map.get(sessionId);
    if (!current) return;
    current.bytesIn = patch.bytesIn ?? current.bytesIn;
    current.bytesOut = patch.bytesOut ?? current.bytesOut;
    current.lastHeartbeatMs = patch.lastHeartbeatMs;
  }

  async delete(sessionId: string): Promise<void> {
    this.map.delete(sessionId);
  }
}
