import { desc, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { inAppBanners, type InAppBannerRow } from '../../db/schema/index.js';

export type { InAppBannerRow };

export interface NewBanner {
  title: string;
  body: string;
  imageUrl?: string | null;
  deeplink?: string | null;
  language?: string | null;
  segment?: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
  priority?: number;
}

export interface BannerRepository {
  listAll(): Promise<InAppBannerRow[]>;
  findById(id: number): Promise<InAppBannerRow | null>;
  create(input: NewBanner): Promise<InAppBannerRow>;
  setEnabled(id: number, enabled: boolean): Promise<void>;
  delete(id: number): Promise<void>;
}

export class DrizzleBannerRepository implements BannerRepository {
  async listAll(): Promise<InAppBannerRow[]> {
    return getDb().select().from(inAppBanners).orderBy(desc(inAppBanners.priority));
  }

  async findById(id: number): Promise<InAppBannerRow | null> {
    const rows = await getDb().select().from(inAppBanners).where(eq(inAppBanners.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async create(input: NewBanner): Promise<InAppBannerRow> {
    const [result] = await getDb()
      .insert(inAppBanners)
      .values({
        title: input.title,
        body: input.body,
        imageUrl: input.imageUrl ?? null,
        deeplink: input.deeplink ?? null,
        language: input.language ?? null,
        segment: input.segment ?? 'all',
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        priority: input.priority ?? 0,
      });
    const created = await this.findById(result.insertId);
    if (!created) throw new Error('banner insert did not persist');
    return created;
  }

  async setEnabled(id: number, enabled: boolean): Promise<void> {
    await getDb().update(inAppBanners).set({ enabled }).where(eq(inAppBanners.id, id));
  }

  async delete(id: number): Promise<void> {
    await getDb().delete(inAppBanners).where(eq(inAppBanners.id, id));
  }
}

export class InMemoryBannerRepository implements BannerRepository {
  private readonly byId = new Map<number, InAppBannerRow>();
  private seq = 0;

  async listAll(): Promise<InAppBannerRow[]> {
    return [...this.byId.values()].sort((a, b) => b.priority - a.priority);
  }

  async findById(id: number): Promise<InAppBannerRow | null> {
    return this.byId.get(id) ?? null;
  }

  async create(input: NewBanner): Promise<InAppBannerRow> {
    const row: InAppBannerRow = {
      id: ++this.seq,
      title: input.title,
      body: input.body,
      imageUrl: input.imageUrl ?? null,
      deeplink: input.deeplink ?? null,
      language: input.language ?? null,
      segment: input.segment ?? 'all',
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      priority: input.priority ?? 0,
      enabled: true,
      createdAt: new Date(),
    };
    this.byId.set(row.id, row);
    return row;
  }

  async setEnabled(id: number, enabled: boolean): Promise<void> {
    const row = this.byId.get(id);
    if (row) row.enabled = enabled;
  }

  async delete(id: number): Promise<void> {
    this.byId.delete(id);
  }
}
