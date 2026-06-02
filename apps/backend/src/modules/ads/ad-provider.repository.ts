import { asc, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { adProviders, type AdProviderRow } from '../../db/schema/index.js';

export type { AdProviderRow };

export interface NewAdProvider {
  key: string;
  name: string;
  priority: number;
  ecpmEstimate: number;
  fillRate: number;
  adUnitId: string;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface AdProviderPatch {
  priority?: number;
  ecpmEstimate?: number;
  fillRate?: number;
  adUnitId?: string;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface AdProviderRepository {
  listAll(): Promise<AdProviderRow[]>;
  findById(id: number): Promise<AdProviderRow | null>;
  create(input: NewAdProvider): Promise<AdProviderRow>;
  update(id: number, patch: AdProviderPatch): Promise<void>;
}

export class DrizzleAdProviderRepository implements AdProviderRepository {
  async listAll(): Promise<AdProviderRow[]> {
    return getDb().select().from(adProviders).orderBy(asc(adProviders.priority));
  }

  async findById(id: number): Promise<AdProviderRow | null> {
    const rows = await getDb().select().from(adProviders).where(eq(adProviders.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async create(input: NewAdProvider): Promise<AdProviderRow> {
    const [result] = await getDb()
      .insert(adProviders)
      .values({
        key: input.key,
        name: input.name,
        priority: input.priority,
        ecpmEstimate: input.ecpmEstimate,
        fillRate: input.fillRate,
        adUnitId: input.adUnitId,
        timeoutMs: input.timeoutMs ?? 5000,
        enabled: input.enabled ?? true,
      });
    const created = await this.findById(result.insertId);
    if (!created) throw new Error('ad provider insert did not persist');
    return created;
  }

  async update(id: number, patch: AdProviderPatch): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    await getDb().update(adProviders).set(patch).where(eq(adProviders.id, id));
  }
}

export class InMemoryAdProviderRepository implements AdProviderRepository {
  private readonly byId = new Map<number, AdProviderRow>();
  private seq = 0;

  constructor(seed: NewAdProvider[] = []) {
    for (const p of seed) {
      const row: AdProviderRow = {
        id: ++this.seq,
        key: p.key,
        name: p.name,
        priority: p.priority,
        ecpmEstimate: p.ecpmEstimate,
        fillRate: p.fillRate,
        adUnitId: p.adUnitId,
        timeoutMs: p.timeoutMs ?? 5000,
        enabled: p.enabled ?? true,
        createdAt: new Date(),
      };
      this.byId.set(row.id, row);
    }
  }

  async listAll(): Promise<AdProviderRow[]> {
    return [...this.byId.values()].sort((a, b) => a.priority - b.priority);
  }

  async findById(id: number): Promise<AdProviderRow | null> {
    return this.byId.get(id) ?? null;
  }

  async create(input: NewAdProvider): Promise<AdProviderRow> {
    const row: AdProviderRow = {
      id: ++this.seq,
      key: input.key,
      name: input.name,
      priority: input.priority,
      ecpmEstimate: input.ecpmEstimate,
      fillRate: input.fillRate,
      adUnitId: input.adUnitId,
      timeoutMs: input.timeoutMs ?? 5000,
      enabled: input.enabled ?? true,
      createdAt: new Date(),
    };
    this.byId.set(row.id, row);
    return row;
  }

  async update(id: number, patch: AdProviderPatch): Promise<void> {
    const row = this.byId.get(id);
    if (!row) return;
    if (patch.priority !== undefined) row.priority = patch.priority;
    if (patch.ecpmEstimate !== undefined) row.ecpmEstimate = patch.ecpmEstimate;
    if (patch.fillRate !== undefined) row.fillRate = patch.fillRate;
    if (patch.adUnitId !== undefined) row.adUnitId = patch.adUnitId;
    if (patch.timeoutMs !== undefined) row.timeoutMs = patch.timeoutMs;
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
  }
}
