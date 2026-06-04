import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { vpnServers, type VpnServerRow } from '../../db/schema/index.js';

export type { VpnServerRow };

export interface NewVpnServer {
  providerId: string;
  country: string;
  name: string;
  city?: string | null;
  host?: string | null;
  configBlob?: string | null;
  pingMs?: number;
  loadPercent?: number;
  status?: string;
  priority?: number;
  countryPriority?: number;
}

export interface ServerHealth {
  pingMs: number;
  status: string;
  recentFailures: number;
}

export interface VpnServerRepository {
  listEnabled(): Promise<VpnServerRow[]>;
  listAll(): Promise<VpnServerRow[]>;
  findById(id: string): Promise<VpnServerRow | null>;
  create(input: NewVpnServer): Promise<VpnServerRow>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  updateHealth(id: string, health: ServerHealth): Promise<void>;
  delete(id: string): Promise<void>;
}

export class DrizzleVpnServerRepository implements VpnServerRepository {
  async listEnabled(): Promise<VpnServerRow[]> {
    return getDb().select().from(vpnServers).where(eq(vpnServers.enabled, true));
  }

  async listAll(): Promise<VpnServerRow[]> {
    return getDb().select().from(vpnServers);
  }

  async findById(id: string): Promise<VpnServerRow | null> {
    const rows = await getDb().select().from(vpnServers).where(eq(vpnServers.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async create(input: NewVpnServer): Promise<VpnServerRow> {
    const id = randomUUID();
    await getDb()
      .insert(vpnServers)
      .values({
        id,
        providerId: input.providerId,
        country: input.country,
        city: input.city ?? null,
        name: input.name,
        host: input.host ?? null,
        configBlob: input.configBlob ?? null,
        pingMs: input.pingMs ?? 0,
        loadPercent: input.loadPercent ?? 0,
        status: input.status ?? 'online',
        priority: input.priority ?? 100,
        countryPriority: input.countryPriority ?? 100,
      });
    const created = await this.findById(id);
    if (!created) throw new Error('vpn server insert did not persist');
    return created;
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await getDb().update(vpnServers).set({ enabled }).where(eq(vpnServers.id, id));
  }

  async updateHealth(id: string, health: ServerHealth): Promise<void> {
    await getDb()
      .update(vpnServers)
      .set({
        pingMs: health.pingMs,
        status: health.status,
        recentFailures: health.recentFailures,
      })
      .where(eq(vpnServers.id, id));
  }

  async delete(id: string): Promise<void> {
    await getDb().delete(vpnServers).where(eq(vpnServers.id, id));
  }
}

export class InMemoryVpnServerRepository implements VpnServerRepository {
  private readonly byId = new Map<string, VpnServerRow>();

  constructor(seed: VpnServerRow[] = []) {
    for (const s of seed) this.byId.set(s.id, s);
  }

  async listEnabled(): Promise<VpnServerRow[]> {
    return [...this.byId.values()].filter((s) => s.enabled);
  }

  async listAll(): Promise<VpnServerRow[]> {
    return [...this.byId.values()];
  }

  async findById(id: string): Promise<VpnServerRow | null> {
    return this.byId.get(id) ?? null;
  }

  async create(input: NewVpnServer): Promise<VpnServerRow> {
    const now = new Date();
    const row: VpnServerRow = {
      id: randomUUID(),
      providerId: input.providerId,
      country: input.country,
      city: input.city ?? null,
      name: input.name,
      host: input.host ?? null,
      configBlob: input.configBlob ?? null,
      pingMs: input.pingMs ?? 0,
      loadPercent: input.loadPercent ?? 0,
      status: input.status ?? 'online',
      recentFailures: 0,
      priority: input.priority ?? 100,
      countryPriority: input.countryPriority ?? 100,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(row.id, row);
    return row;
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const row = this.byId.get(id);
    if (row) row.enabled = enabled;
  }

  async updateHealth(id: string, health: ServerHealth): Promise<void> {
    const row = this.byId.get(id);
    if (row) {
      row.pingMs = health.pingMs;
      row.status = health.status;
      row.recentFailures = health.recentFailures;
    }
  }

  async delete(id: string): Promise<void> {
    this.byId.delete(id);
  }
}
