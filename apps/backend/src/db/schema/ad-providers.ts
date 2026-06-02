import {
  bigint,
  boolean,
  double,
  int,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

/**
 * Ad mediation providers + waterfall order (SPEC "Ad waterfall logic"). The
 * backend serves the order so priorities change without an app release. eCPM /
 * fill rate are operator estimates / analytics — never sent to the client.
 */
export const adProviders = mysqlTable(
  'ad_providers',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    key: varchar('provider_key', { length: 32 }).notNull(),
    name: varchar('name', { length: 64 }).notNull(),
    /** Lower = tried first. */
    priority: int('priority').notNull().default(100),
    ecpmEstimate: double('ecpm_estimate').notNull().default(0),
    fillRate: double('fill_rate').notNull().default(0),
    /** Ad unit id (placeholder until real). Not a secret from the client — it
     * loads it — but kept out of the APK and served from here. */
    adUnitId: varchar('ad_unit_id', { length: 128 }).notNull(),
    timeoutMs: int('timeout_ms').notNull().default(5000),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ad_providers_key_uq').on(t.key)],
);

export type AdProviderRow = typeof adProviders.$inferSelect;
