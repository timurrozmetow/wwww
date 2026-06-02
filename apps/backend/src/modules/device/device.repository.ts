import { desc, eq, sql } from 'drizzle-orm';
import type { Language, Platform } from '@vpn/types';
import { getDb } from '../../db/client.js';
import { devices, type DeviceRow } from '../../db/schema/index.js';
import { isDuplicateKeyError } from '../../lib/db-errors.js';

export type { DeviceRow };

/** Thrown when an insert collides with the `install_id` unique constraint. */
export class DuplicateInstallIdError extends Error {
  constructor() {
    super('install_id already exists');
    this.name = 'DuplicateInstallIdError';
  }
}

export interface NewDeviceInput {
  id: string;
  installId: string;
  appVersion: string;
  platform: Platform;
  language: Language;
  country?: string | null;
  timezone?: string | null;
  deviceIntegrityStatus?: string | null;
}

export interface DeviceTouch {
  appVersion?: string;
  lastSeenAt: Date;
}

export interface DeviceListOptions {
  limit: number;
  offset: number;
}

export interface DeviceRepository {
  findById(id: string): Promise<DeviceRow | null>;
  findByInstallId(installId: string): Promise<DeviceRow | null>;
  create(input: NewDeviceInput): Promise<DeviceRow>;
  touch(id: string, patch: DeviceTouch): Promise<void>;
  list(opts: DeviceListOptions): Promise<DeviceRow[]>;
  count(): Promise<number>;
  countBlocked(): Promise<number>;
  setBlocked(id: string, blocked: boolean): Promise<void>;
  /** Atomically add `delta` to fraud_score and return the new score. */
  addFraudScore(id: string, delta: number): Promise<number>;
}

/** Drizzle/MySQL-backed implementation. */
export class DrizzleDeviceRepository implements DeviceRepository {
  async findById(id: string): Promise<DeviceRow | null> {
    const rows = await getDb().select().from(devices).where(eq(devices.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findByInstallId(installId: string): Promise<DeviceRow | null> {
    const rows = await getDb()
      .select()
      .from(devices)
      .where(eq(devices.installId, installId))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(input: NewDeviceInput): Promise<DeviceRow> {
    try {
      await getDb()
        .insert(devices)
        .values({
          id: input.id,
          installId: input.installId,
          appVersion: input.appVersion,
          platform: input.platform,
          language: input.language,
          country: input.country ?? null,
          timezone: input.timezone ?? null,
          deviceIntegrityStatus: input.deviceIntegrityStatus ?? null,
        });
    } catch (err) {
      // Concurrent registration lost the install_id race — let the service reuse
      // the winner's row instead of surfacing a 500.
      if (isDuplicateKeyError(err)) throw new DuplicateInstallIdError();
      throw err;
    }
    const created = await this.findById(input.id);
    if (!created) throw new Error('device insert did not persist');
    return created;
  }

  async touch(id: string, patch: DeviceTouch): Promise<void> {
    await getDb()
      .update(devices)
      .set({
        lastSeenAt: patch.lastSeenAt,
        ...(patch.appVersion ? { appVersion: patch.appVersion } : {}),
      })
      .where(eq(devices.id, id));
  }

  async list(opts: DeviceListOptions): Promise<DeviceRow[]> {
    return getDb()
      .select()
      .from(devices)
      .orderBy(desc(devices.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async count(): Promise<number> {
    const rows = await getDb()
      .select({ c: sql<string>`COUNT(*)` })
      .from(devices);
    return Number(rows[0]?.c ?? 0);
  }

  async countBlocked(): Promise<number> {
    const rows = await getDb()
      .select({ c: sql<string>`COUNT(*)` })
      .from(devices)
      .where(eq(devices.isBlocked, true));
    return Number(rows[0]?.c ?? 0);
  }

  async setBlocked(id: string, blocked: boolean): Promise<void> {
    await getDb().update(devices).set({ isBlocked: blocked }).where(eq(devices.id, id));
  }

  async addFraudScore(id: string, delta: number): Promise<number> {
    // Single-statement increment so concurrent signals can't lose updates.
    await getDb()
      .update(devices)
      .set({ fraudScore: sql`${devices.fraudScore} + ${delta}` })
      .where(eq(devices.id, id));
    const row = await this.findById(id);
    return row?.fraudScore ?? 0;
  }
}

/** In-memory implementation for tests (no database required). */
export class InMemoryDeviceRepository implements DeviceRepository {
  private readonly byId = new Map<string, DeviceRow>();

  async findById(id: string): Promise<DeviceRow | null> {
    return this.byId.get(id) ?? null;
  }

  async findByInstallId(installId: string): Promise<DeviceRow | null> {
    for (const row of this.byId.values()) {
      if (row.installId === installId) return row;
    }
    return null;
  }

  async create(input: NewDeviceInput): Promise<DeviceRow> {
    // Model the install_id unique constraint so tests exercise the same race path.
    for (const existing of this.byId.values()) {
      if (existing.installId === input.installId) throw new DuplicateInstallIdError();
    }
    const now = new Date();
    const row: DeviceRow = {
      id: input.id,
      installId: input.installId,
      appVersion: input.appVersion,
      platform: input.platform,
      language: input.language,
      country: input.country ?? null,
      timezone: input.timezone ?? null,
      deviceIntegrityStatus: input.deviceIntegrityStatus ?? null,
      fraudScore: 0,
      isBlocked: false,
      balanceMinutesCache: 0,
      createdAt: now,
      lastSeenAt: now,
      updatedAt: now,
    };
    this.byId.set(row.id, row);
    return row;
  }

  async touch(id: string, patch: DeviceTouch): Promise<void> {
    const row = this.byId.get(id);
    if (!row) return;
    row.lastSeenAt = patch.lastSeenAt;
    if (patch.appVersion) row.appVersion = patch.appVersion;
  }

  async list(opts: DeviceListOptions): Promise<DeviceRow[]> {
    return [...this.byId.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(opts.offset, opts.offset + opts.limit);
  }

  async count(): Promise<number> {
    return this.byId.size;
  }

  async countBlocked(): Promise<number> {
    return [...this.byId.values()].filter((d) => d.isBlocked).length;
  }

  async setBlocked(id: string, blocked: boolean): Promise<void> {
    const row = this.byId.get(id);
    if (row) row.isBlocked = blocked;
  }

  async addFraudScore(id: string, delta: number): Promise<number> {
    const row = this.byId.get(id);
    if (!row) return 0;
    row.fraudScore += delta;
    return row.fraudScore;
  }
}
