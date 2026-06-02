import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { adSessions, type AdSessionRow } from '../../db/schema/index.js';

export type { AdSessionRow };

export interface AdSessionRepository {
  create(deviceId: string, provider: string): Promise<AdSessionRow>;
  findById(id: string): Promise<AdSessionRow | null>;
  markRewarded(id: string, minutes: number): Promise<void>;
  count(): Promise<number>;
}

export class DrizzleAdSessionRepository implements AdSessionRepository {
  async create(deviceId: string, provider: string): Promise<AdSessionRow> {
    const id = randomUUID();
    await getDb().insert(adSessions).values({ id, deviceId, provider });
    const created = await this.findById(id);
    if (!created) throw new Error('ad session insert did not persist');
    return created;
  }

  async findById(id: string): Promise<AdSessionRow | null> {
    const rows = await getDb().select().from(adSessions).where(eq(adSessions.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async markRewarded(id: string, minutes: number): Promise<void> {
    await getDb()
      .update(adSessions)
      .set({ status: 'rewarded', rewardMinutes: minutes, rewardedAt: new Date() })
      .where(eq(adSessions.id, id));
  }

  async count(): Promise<number> {
    const rows = await getDb()
      .select({ c: sql<string>`COUNT(*)` })
      .from(adSessions);
    return Number(rows[0]?.c ?? 0);
  }
}

export class InMemoryAdSessionRepository implements AdSessionRepository {
  private readonly byId = new Map<string, AdSessionRow>();

  async create(deviceId: string, provider: string): Promise<AdSessionRow> {
    const now = new Date();
    const row: AdSessionRow = {
      id: randomUUID(),
      deviceId,
      provider,
      status: 'pending',
      rewardMinutes: null,
      createdAt: now,
      rewardedAt: null,
    };
    this.byId.set(row.id, row);
    return row;
  }

  async findById(id: string): Promise<AdSessionRow | null> {
    return this.byId.get(id) ?? null;
  }

  async markRewarded(id: string, minutes: number): Promise<void> {
    const row = this.byId.get(id);
    if (!row) return;
    row.status = 'rewarded';
    row.rewardMinutes = minutes;
    row.rewardedAt = new Date();
  }

  async count(): Promise<number> {
    return this.byId.size;
  }
}
