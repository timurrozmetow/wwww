import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { vpnSessions, type VpnSessionRow } from '../../db/schema/index.js';
import { isDuplicateKeyError } from '../../lib/db-errors.js';

export type { VpnSessionRow };

/** Thrown when a device already has an active session (one-active-per-device). */
export class DuplicateActiveSessionError extends Error {
  constructor() {
    super('device already has an active session');
    this.name = 'DuplicateActiveSessionError';
  }
}

export interface NewVpnSession {
  id: string;
  deviceId: string;
  serverId: string;
  token: string;
  allottedMinutes: number;
  deadline: Date;
}

export interface FinalizeVpnSession {
  status: 'ended' | 'expired';
  minutesDebited: number;
  bytesIn: number;
  bytesOut: number;
  endedAt: Date;
  disconnectReason: string;
}

export interface VpnSessionRepository {
  create(input: NewVpnSession): Promise<VpnSessionRow>;
  findById(id: string): Promise<VpnSessionRow | null>;
  findActiveByDevice(deviceId: string): Promise<VpnSessionRow | null>;
  /** Finalizes only if still active (single-winner). Returns true if it transitioned. */
  finalize(id: string, patch: FinalizeVpnSession): Promise<boolean>;
}

export class DrizzleVpnSessionRepository implements VpnSessionRepository {
  async create(input: NewVpnSession): Promise<VpnSessionRow> {
    try {
      await getDb().insert(vpnSessions).values({
        id: input.id,
        deviceId: input.deviceId,
        activeDeviceId: input.deviceId,
        serverId: input.serverId,
        token: input.token,
        allottedMinutes: input.allottedMinutes,
        deadline: input.deadline,
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) throw new DuplicateActiveSessionError();
      throw err;
    }
    const created = await this.findById(input.id);
    if (!created) throw new Error('vpn session insert did not persist');
    return created;
  }

  async findById(id: string): Promise<VpnSessionRow | null> {
    const rows = await getDb().select().from(vpnSessions).where(eq(vpnSessions.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findActiveByDevice(deviceId: string): Promise<VpnSessionRow | null> {
    const rows = await getDb()
      .select()
      .from(vpnSessions)
      .where(and(eq(vpnSessions.deviceId, deviceId), eq(vpnSessions.status, 'active')))
      .limit(1);
    return rows[0] ?? null;
  }

  async finalize(id: string, patch: FinalizeVpnSession): Promise<boolean> {
    const result = await getDb()
      .update(vpnSessions)
      .set({
        status: patch.status,
        activeDeviceId: null,
        minutesDebited: patch.minutesDebited,
        bytesIn: patch.bytesIn,
        bytesOut: patch.bytesOut,
        endedAt: patch.endedAt,
        disconnectReason: patch.disconnectReason,
      })
      .where(and(eq(vpnSessions.id, id), eq(vpnSessions.status, 'active')));
    return (result[0]?.affectedRows ?? 0) > 0;
  }
}

export class InMemoryVpnSessionRepository implements VpnSessionRepository {
  private readonly byId = new Map<string, VpnSessionRow>();

  async create(input: NewVpnSession): Promise<VpnSessionRow> {
    for (const row of this.byId.values()) {
      if (row.activeDeviceId === input.deviceId) throw new DuplicateActiveSessionError();
    }
    const now = new Date();
    const row: VpnSessionRow = {
      id: input.id,
      deviceId: input.deviceId,
      activeDeviceId: input.deviceId,
      serverId: input.serverId,
      status: 'active',
      token: input.token,
      allottedMinutes: input.allottedMinutes,
      minutesDebited: 0,
      bytesIn: 0,
      bytesOut: 0,
      startedAt: now,
      deadline: input.deadline,
      endedAt: null,
      disconnectReason: null,
    };
    this.byId.set(row.id, row);
    return row;
  }

  async findById(id: string): Promise<VpnSessionRow | null> {
    return this.byId.get(id) ?? null;
  }

  async findActiveByDevice(deviceId: string): Promise<VpnSessionRow | null> {
    for (const row of this.byId.values()) {
      if (row.deviceId === deviceId && row.status === 'active') return row;
    }
    return null;
  }

  async finalize(id: string, patch: FinalizeVpnSession): Promise<boolean> {
    const row = this.byId.get(id);
    if (!row || row.status !== 'active') return false;
    row.status = patch.status;
    row.activeDeviceId = null;
    row.minutesDebited = patch.minutesDebited;
    row.bytesIn = patch.bytesIn;
    row.bytesOut = patch.bytesOut;
    row.endedAt = patch.endedAt;
    row.disconnectReason = patch.disconnectReason;
    return true;
  }
}
