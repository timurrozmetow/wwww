import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { pushTokens, type PushTokenRow } from '../../db/schema/index.js';

export type { PushTokenRow };

export interface PushTokenRepository {
  /** Idempotent on the token (UNIQUE). Re-registering re-enables + re-points it. */
  upsert(deviceId: string, token: string, platform?: string): Promise<void>;
  listEnabled(): Promise<PushTokenRow[]>;
  findByDevice(deviceId: string): Promise<PushTokenRow[]>;
  disableToken(token: string): Promise<void>;
}

export class DrizzlePushTokenRepository implements PushTokenRepository {
  async upsert(deviceId: string, token: string, platform = 'android'): Promise<void> {
    await getDb()
      .insert(pushTokens)
      .values({ deviceId, token, platform })
      .onDuplicateKeyUpdate({ set: { deviceId, platform, enabled: true } });
  }

  async listEnabled(): Promise<PushTokenRow[]> {
    return getDb().select().from(pushTokens).where(eq(pushTokens.enabled, true));
  }

  async findByDevice(deviceId: string): Promise<PushTokenRow[]> {
    return getDb().select().from(pushTokens).where(eq(pushTokens.deviceId, deviceId));
  }

  async disableToken(token: string): Promise<void> {
    await getDb().update(pushTokens).set({ enabled: false }).where(eq(pushTokens.token, token));
  }
}

export class InMemoryPushTokenRepository implements PushTokenRepository {
  private readonly byToken = new Map<string, PushTokenRow>();
  private seq = 0;

  async upsert(deviceId: string, token: string, platform = 'android'): Promise<void> {
    const existing = this.byToken.get(token);
    if (existing) {
      existing.deviceId = deviceId;
      existing.platform = platform;
      existing.enabled = true;
      existing.updatedAt = new Date();
      return;
    }
    const now = new Date();
    this.byToken.set(token, {
      id: ++this.seq,
      deviceId,
      token,
      platform,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  async listEnabled(): Promise<PushTokenRow[]> {
    return [...this.byToken.values()].filter((t) => t.enabled);
  }

  async findByDevice(deviceId: string): Promise<PushTokenRow[]> {
    return [...this.byToken.values()].filter((t) => t.deviceId === deviceId);
  }

  async disableToken(token: string): Promise<void> {
    const row = this.byToken.get(token);
    if (row) row.enabled = false;
  }
}
