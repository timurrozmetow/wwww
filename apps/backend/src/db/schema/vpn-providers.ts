import { boolean, int, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

/**
 * VPN upstream providers. Subscription URLs / keys are stored encrypted at rest
 * (CLAUDE.md §9) and NEVER exposed to clients.
 */
export const vpnProviders = mysqlTable('vpn_providers', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 64 }).notNull(),
  type: varchar('type', { length: 24 }).notNull().default('subscription'),
  /** Encrypted subscription URL / config source (placeholder until real keys). */
  subscriptionSecret: varchar('subscription_secret', { length: 512 }),
  priority: int('priority').notNull().default(100),
  enabled: boolean('enabled').notNull().default(true),
  lastSyncAt: timestamp('last_sync_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type VpnProviderRow = typeof vpnProviders.$inferSelect;
