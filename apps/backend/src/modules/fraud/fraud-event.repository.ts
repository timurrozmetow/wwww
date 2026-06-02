import { and, desc, eq, gte } from 'drizzle-orm';
import type { FraudEventView } from '@vpn/types';
import { getDb } from '../../db/client.js';
import { fraudEvents, type FraudEventRow } from '../../db/schema/index.js';

export type { FraudEventRow };

export interface FraudEventInput {
  deviceId: string;
  eventType: string;
  severity: number;
  source: string;
  metadata?: unknown;
}

function toView(r: FraudEventRow): FraudEventView {
  return {
    id: r.id,
    deviceId: r.deviceId,
    eventType: r.eventType,
    severity: r.severity,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
  };
}

export interface FraudEventRepository {
  record(input: FraudEventInput): Promise<void>;
  listRecent(limit: number): Promise<FraudEventView[]>;
  listByDevice(deviceId: string, limit: number): Promise<FraudEventView[]>;
  countByTypeSince(deviceId: string, eventType: string, since: Date): Promise<number>;
}

export class DrizzleFraudEventRepository implements FraudEventRepository {
  async record(input: FraudEventInput): Promise<void> {
    await getDb()
      .insert(fraudEvents)
      .values({
        deviceId: input.deviceId,
        eventType: input.eventType,
        severity: input.severity,
        source: input.source,
        metadata: input.metadata ?? null,
      });
  }

  async listRecent(limit: number): Promise<FraudEventView[]> {
    const rows = await getDb()
      .select()
      .from(fraudEvents)
      .orderBy(desc(fraudEvents.createdAt))
      .limit(limit);
    return rows.map(toView);
  }

  async listByDevice(deviceId: string, limit: number): Promise<FraudEventView[]> {
    const rows = await getDb()
      .select()
      .from(fraudEvents)
      .where(eq(fraudEvents.deviceId, deviceId))
      .orderBy(desc(fraudEvents.createdAt))
      .limit(limit);
    return rows.map(toView);
  }

  async countByTypeSince(deviceId: string, eventType: string, since: Date): Promise<number> {
    const rows = await getDb()
      .select()
      .from(fraudEvents)
      .where(
        and(
          eq(fraudEvents.deviceId, deviceId),
          eq(fraudEvents.eventType, eventType),
          gte(fraudEvents.createdAt, since),
        ),
      );
    return rows.length;
  }
}

export class InMemoryFraudEventRepository implements FraudEventRepository {
  private readonly rows: FraudEventRow[] = [];
  private seq = 0;

  async record(input: FraudEventInput): Promise<void> {
    this.rows.push({
      id: ++this.seq,
      deviceId: input.deviceId,
      eventType: input.eventType,
      severity: input.severity,
      source: input.source,
      metadata: input.metadata ?? null,
      createdAt: new Date(),
    });
  }

  async listRecent(limit: number): Promise<FraudEventView[]> {
    return [...this.rows]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map(toView);
  }

  async listByDevice(deviceId: string, limit: number): Promise<FraudEventView[]> {
    return [...this.rows]
      .filter((r) => r.deviceId === deviceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map(toView);
  }

  async countByTypeSince(deviceId: string, eventType: string, since: Date): Promise<number> {
    return this.rows.filter(
      (r) =>
        r.deviceId === deviceId &&
        r.eventType === eventType &&
        r.createdAt.getTime() >= since.getTime(),
    ).length;
  }
}
