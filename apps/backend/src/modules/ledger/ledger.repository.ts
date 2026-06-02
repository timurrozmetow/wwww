import { desc, eq, sql } from 'drizzle-orm';
import type { LedgerEntryType } from '@vpn/types';
import { getDb } from '../../db/client.js';
import { minuteLedger } from '../../db/schema/index.js';
import { isDuplicateKeyError } from '../../lib/db-errors.js';

export interface LedgerEntryInput {
  deviceId: string;
  entryType: LedgerEntryType;
  /** Signed: +30 reward, +15 emergency, -N usage, ± adjustment. */
  minutes: number;
  /** Global idempotency key (e.g. `vpn_usage:<sessionId>`); null when there is none. */
  referenceId?: string | null;
  metadata?: unknown;
  expiresAt?: Date | null;
}

export interface LedgerEntryRecord {
  entryType: LedgerEntryType;
  minutes: number;
  referenceId: string | null;
  createdAt: Date;
}

/**
 * Minute ledger. Balance is always the signed SUM (CLAUDE.md §7.5). `append`
 * is idempotent on `referenceId` — a duplicate credit is a no-op, not an error.
 */
export interface LedgerRepository {
  getBalance(deviceId: string): Promise<number>;
  append(entry: LedgerEntryInput): Promise<{ created: boolean }>;
  sumByType(entryType: LedgerEntryType): Promise<number>;
  listByDevice(deviceId: string, limit: number): Promise<LedgerEntryRecord[]>;
}

export class DrizzleLedgerRepository implements LedgerRepository {
  async getBalance(deviceId: string): Promise<number> {
    const rows = await getDb()
      .select({ total: sql<string>`COALESCE(SUM(${minuteLedger.minutes}), 0)` })
      .from(minuteLedger)
      .where(eq(minuteLedger.deviceId, deviceId));
    return Number(rows[0]?.total ?? 0);
  }

  async append(entry: LedgerEntryInput): Promise<{ created: boolean }> {
    try {
      await getDb()
        .insert(minuteLedger)
        .values({
          deviceId: entry.deviceId,
          entryType: entry.entryType,
          minutes: entry.minutes,
          referenceId: entry.referenceId ?? null,
          metadata: entry.metadata ?? null,
          expiresAt: entry.expiresAt ?? null,
        });
      return { created: true };
    } catch (err) {
      // Duplicate reference_id → already credited; idempotent no-op.
      if (isDuplicateKeyError(err)) return { created: false };
      throw err;
    }
  }

  async sumByType(entryType: LedgerEntryType): Promise<number> {
    const rows = await getDb()
      .select({ total: sql<string>`COALESCE(SUM(${minuteLedger.minutes}), 0)` })
      .from(minuteLedger)
      .where(eq(minuteLedger.entryType, entryType));
    return Number(rows[0]?.total ?? 0);
  }

  async listByDevice(deviceId: string, limit: number): Promise<LedgerEntryRecord[]> {
    const rows = await getDb()
      .select({
        entryType: minuteLedger.entryType,
        minutes: minuteLedger.minutes,
        referenceId: minuteLedger.referenceId,
        createdAt: minuteLedger.createdAt,
      })
      .from(minuteLedger)
      .where(eq(minuteLedger.deviceId, deviceId))
      .orderBy(desc(minuteLedger.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      entryType: r.entryType as LedgerEntryType,
      minutes: r.minutes,
      referenceId: r.referenceId,
      createdAt: r.createdAt,
    }));
  }
}

interface MemoryLedgerEntry {
  deviceId: string;
  entryType: LedgerEntryType;
  minutes: number;
  referenceId: string | null;
  createdAt: Date;
}

export class InMemoryLedgerRepository implements LedgerRepository {
  private readonly entries: MemoryLedgerEntry[] = [];
  private readonly references = new Set<string>();

  async getBalance(deviceId: string): Promise<number> {
    return this.entries
      .filter((e) => e.deviceId === deviceId)
      .reduce((sum, e) => sum + e.minutes, 0);
  }

  async append(entry: LedgerEntryInput): Promise<{ created: boolean }> {
    const ref = entry.referenceId ?? null;
    if (ref !== null && this.references.has(ref)) return { created: false };
    if (ref !== null) this.references.add(ref);
    this.entries.push({
      deviceId: entry.deviceId,
      entryType: entry.entryType,
      minutes: entry.minutes,
      referenceId: ref,
      createdAt: new Date(),
    });
    return { created: true };
  }

  async sumByType(entryType: LedgerEntryType): Promise<number> {
    return this.entries.filter((e) => e.entryType === entryType).reduce((s, e) => s + e.minutes, 0);
  }

  async listByDevice(deviceId: string, limit: number): Promise<LedgerEntryRecord[]> {
    return this.entries
      .filter((e) => e.deviceId === deviceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /** Test helper to seed a non-idempotent movement (e.g. usage). */
  add(deviceId: string, minutes: number): void {
    this.entries.push({
      deviceId,
      entryType: 'admin_adjustment',
      minutes,
      referenceId: null,
      createdAt: new Date(),
    });
  }
}
