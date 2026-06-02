import { desc, eq } from 'drizzle-orm';
import type { PushCampaignStatus } from '@vpn/types';
import { getDb } from '../../db/client.js';
import { pushCampaigns, type PushCampaignRow } from '../../db/schema/index.js';

export type { PushCampaignRow };

export interface NewPushCampaign {
  title: string;
  body: string;
  language?: string | null;
  segment?: string;
  country?: string | null;
}

export interface CampaignSendResult {
  status: PushCampaignStatus;
  recipientCount: number;
  sentCount: number;
  sentAt: Date | null;
}

export interface PushCampaignRepository {
  listAll(): Promise<PushCampaignRow[]>;
  findById(id: number): Promise<PushCampaignRow | null>;
  create(input: NewPushCampaign): Promise<PushCampaignRow>;
  setStatus(id: number, status: PushCampaignStatus): Promise<void>;
  recordResult(id: number, result: CampaignSendResult): Promise<void>;
}

export class DrizzlePushCampaignRepository implements PushCampaignRepository {
  async listAll(): Promise<PushCampaignRow[]> {
    return getDb().select().from(pushCampaigns).orderBy(desc(pushCampaigns.createdAt));
  }

  async findById(id: number): Promise<PushCampaignRow | null> {
    const rows = await getDb()
      .select()
      .from(pushCampaigns)
      .where(eq(pushCampaigns.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(input: NewPushCampaign): Promise<PushCampaignRow> {
    const [result] = await getDb()
      .insert(pushCampaigns)
      .values({
        title: input.title,
        body: input.body,
        language: input.language ?? null,
        segment: input.segment ?? 'all',
        country: input.country ?? null,
      });
    const created = await this.findById(result.insertId);
    if (!created) throw new Error('push campaign insert did not persist');
    return created;
  }

  async setStatus(id: number, status: PushCampaignStatus): Promise<void> {
    await getDb().update(pushCampaigns).set({ status }).where(eq(pushCampaigns.id, id));
  }

  async recordResult(id: number, result: CampaignSendResult): Promise<void> {
    await getDb()
      .update(pushCampaigns)
      .set({
        status: result.status,
        recipientCount: result.recipientCount,
        sentCount: result.sentCount,
        sentAt: result.sentAt,
      })
      .where(eq(pushCampaigns.id, id));
  }
}

export class InMemoryPushCampaignRepository implements PushCampaignRepository {
  private readonly byId = new Map<number, PushCampaignRow>();
  private seq = 0;

  async listAll(): Promise<PushCampaignRow[]> {
    return [...this.byId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(id: number): Promise<PushCampaignRow | null> {
    return this.byId.get(id) ?? null;
  }

  async create(input: NewPushCampaign): Promise<PushCampaignRow> {
    const row: PushCampaignRow = {
      id: ++this.seq,
      title: input.title,
      body: input.body,
      language: input.language ?? null,
      segment: input.segment ?? 'all',
      country: input.country ?? null,
      status: 'draft',
      recipientCount: 0,
      sentCount: 0,
      createdAt: new Date(),
      sentAt: null,
    };
    this.byId.set(row.id, row);
    return row;
  }

  async setStatus(id: number, status: PushCampaignStatus): Promise<void> {
    const row = this.byId.get(id);
    if (row) row.status = status;
  }

  async recordResult(id: number, result: CampaignSendResult): Promise<void> {
    const row = this.byId.get(id);
    if (!row) return;
    row.status = result.status;
    row.recipientCount = result.recipientCount;
    row.sentCount = result.sentCount;
    row.sentAt = result.sentAt;
  }
}
