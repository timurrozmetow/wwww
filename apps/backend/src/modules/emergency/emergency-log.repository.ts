import { and, desc, eq, gt, sql } from 'drizzle-orm';
import type { EmergencyLogEntry } from '@vpn/types';
import { getDb } from '../../db/client.js';
import { emergencyAccessLogs } from '../../db/schema/index.js';

export interface NewEmergencyLog {
  deviceId: string;
  granted: boolean;
  minutes: number;
  reason: string;
  failedNetworks: number;
}

export interface EmergencyLogRepository {
  record(input: NewEmergencyLog): Promise<void>;
  /** Count of GRANTED emergencies for a device since `since`. */
  countGrantedSince(deviceId: string, since: Date): Promise<number>;
  listRecent(limit: number): Promise<EmergencyLogEntry[]>;
}

export class DrizzleEmergencyLogRepository implements EmergencyLogRepository {
  async record(input: NewEmergencyLog): Promise<void> {
    await getDb().insert(emergencyAccessLogs).values({
      deviceId: input.deviceId,
      granted: input.granted,
      minutes: input.minutes,
      reason: input.reason,
      failedNetworks: input.failedNetworks,
    });
  }

  async countGrantedSince(deviceId: string, since: Date): Promise<number> {
    const rows = await getDb()
      .select({ c: sql<string>`COUNT(*)` })
      .from(emergencyAccessLogs)
      .where(
        and(
          eq(emergencyAccessLogs.deviceId, deviceId),
          eq(emergencyAccessLogs.granted, true),
          gt(emergencyAccessLogs.createdAt, since),
        ),
      );
    return Number(rows[0]?.c ?? 0);
  }

  async listRecent(limit: number): Promise<EmergencyLogEntry[]> {
    const rows = await getDb()
      .select()
      .from(emergencyAccessLogs)
      .orderBy(desc(emergencyAccessLogs.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      deviceId: r.deviceId,
      granted: r.granted,
      minutes: r.minutes,
      reason: r.reason,
      failedNetworks: r.failedNetworks,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

interface MemoryLog {
  id: number;
  deviceId: string;
  granted: boolean;
  minutes: number;
  reason: string;
  failedNetworks: number;
  createdAt: Date;
}

export class InMemoryEmergencyLogRepository implements EmergencyLogRepository {
  private readonly rows: MemoryLog[] = [];
  private seq = 0;

  async record(input: NewEmergencyLog): Promise<void> {
    this.rows.push({ id: ++this.seq, ...input, createdAt: new Date() });
  }

  async countGrantedSince(deviceId: string, since: Date): Promise<number> {
    return this.rows.filter((r) => r.deviceId === deviceId && r.granted && r.createdAt > since)
      .length;
  }

  async listRecent(limit: number): Promise<EmergencyLogEntry[]> {
    return [...this.rows]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        deviceId: r.deviceId,
        granted: r.granted,
        minutes: r.minutes,
        reason: r.reason,
        failedNetworks: r.failedNetworks,
        createdAt: r.createdAt.toISOString(),
      }));
  }

  /** Test helper to backdate the most recent log. */
  backdateLast(ms: number): void {
    const last = this.rows[this.rows.length - 1];
    if (last) last.createdAt = new Date(last.createdAt.getTime() - ms);
  }
}
