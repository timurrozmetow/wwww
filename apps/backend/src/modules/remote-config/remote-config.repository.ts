import { sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { remoteConfig } from '../../db/schema/index.js';

export interface RemoteConfigEntry {
  key: string;
  value: string;
  valueType: string;
}

export interface RemoteConfigUpsert {
  key: string;
  value: string;
  valueType: string;
  updatedBy?: string | null;
}

export interface RemoteConfigRepository {
  getAll(): Promise<RemoteConfigEntry[]>;
  upsert(input: RemoteConfigUpsert): Promise<void>;
}

export class DrizzleRemoteConfigRepository implements RemoteConfigRepository {
  async getAll(): Promise<RemoteConfigEntry[]> {
    return getDb()
      .select({
        key: remoteConfig.key,
        value: remoteConfig.value,
        valueType: remoteConfig.valueType,
      })
      .from(remoteConfig);
  }

  async upsert(input: RemoteConfigUpsert): Promise<void> {
    await getDb()
      .insert(remoteConfig)
      .values({
        key: input.key,
        value: input.value,
        valueType: input.valueType,
        updatedBy: input.updatedBy ?? null,
      })
      .onDuplicateKeyUpdate({
        set: {
          value: input.value,
          valueType: input.valueType,
          updatedBy: input.updatedBy ?? null,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });
  }
}

export class InMemoryRemoteConfigRepository implements RemoteConfigRepository {
  private readonly byKey = new Map<string, RemoteConfigEntry>();

  constructor(entries: RemoteConfigEntry[] = []) {
    for (const e of entries) this.byKey.set(e.key, e);
  }

  async getAll(): Promise<RemoteConfigEntry[]> {
    return [...this.byKey.values()];
  }

  async upsert(input: RemoteConfigUpsert): Promise<void> {
    this.byKey.set(input.key, {
      key: input.key,
      value: input.value,
      valueType: input.valueType,
    });
  }
}
