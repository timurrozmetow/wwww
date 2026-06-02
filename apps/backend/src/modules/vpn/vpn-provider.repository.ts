import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { vpnProviders, type VpnProviderRow } from '../../db/schema/index.js';

export type { VpnProviderRow };

export interface NewVpnProvider {
  name: string;
  type?: string;
  priority?: number;
}

export interface VpnProviderRepository {
  listAll(): Promise<VpnProviderRow[]>;
  findById(id: string): Promise<VpnProviderRow | null>;
  create(input: NewVpnProvider): Promise<VpnProviderRow>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
}

export class DrizzleVpnProviderRepository implements VpnProviderRepository {
  async listAll(): Promise<VpnProviderRow[]> {
    return getDb().select().from(vpnProviders);
  }

  async findById(id: string): Promise<VpnProviderRow | null> {
    const rows = await getDb().select().from(vpnProviders).where(eq(vpnProviders.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async create(input: NewVpnProvider): Promise<VpnProviderRow> {
    const id = randomUUID();
    await getDb()
      .insert(vpnProviders)
      .values({
        id,
        name: input.name,
        type: input.type ?? 'subscription',
        priority: input.priority ?? 100,
      });
    const created = await this.findById(id);
    if (!created) throw new Error('vpn provider insert did not persist');
    return created;
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await getDb().update(vpnProviders).set({ enabled }).where(eq(vpnProviders.id, id));
  }
}

export class InMemoryVpnProviderRepository implements VpnProviderRepository {
  private readonly byId = new Map<string, VpnProviderRow>();

  constructor(seed: VpnProviderRow[] = []) {
    for (const p of seed) this.byId.set(p.id, p);
  }

  async listAll(): Promise<VpnProviderRow[]> {
    return [...this.byId.values()];
  }

  async findById(id: string): Promise<VpnProviderRow | null> {
    return this.byId.get(id) ?? null;
  }

  async create(input: NewVpnProvider): Promise<VpnProviderRow> {
    const row: VpnProviderRow = {
      id: randomUUID(),
      name: input.name,
      type: input.type ?? 'subscription',
      subscriptionSecret: null,
      priority: input.priority ?? 100,
      enabled: true,
      lastSyncAt: null,
      createdAt: new Date(),
    };
    this.byId.set(row.id, row);
    return row;
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const row = this.byId.get(id);
    if (row) row.enabled = enabled;
  }
}
