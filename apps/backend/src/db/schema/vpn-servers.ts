import { boolean, index, int, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';

/**
 * VPN servers. `host` and `configBlob` are sensitive (encrypted at rest, §9) and
 * NEVER returned to clients — only country/city/name/ping/quality (§7.2).
 */
export const vpnServers = mysqlTable(
  'vpn_servers',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    providerId: varchar('provider_id', { length: 36 }).notNull(),
    country: varchar('country', { length: 8 }).notNull(),
    city: varchar('city', { length: 64 }),
    name: varchar('name', { length: 64 }).notNull(),
    /** Sensitive — not exposed. */
    host: varchar('host', { length: 255 }),
    /** Encrypted connection config (placeholder until real keys). Not exposed. */
    configBlob: text('config_blob'),
    pingMs: int('ping_ms').notNull().default(0),
    loadPercent: int('load_percent').notNull().default(0),
    status: varchar('status', { length: 16 }).notNull().default('online'),
    recentFailures: int('recent_failures').notNull().default(0),
    priority: int('priority').notNull().default(100),
    countryPriority: int('country_priority').notNull().default(100),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index('vpn_servers_provider_idx').on(t.providerId),
    index('vpn_servers_enabled_status_idx').on(t.enabled, t.status),
    index('vpn_servers_country_idx').on(t.country),
  ],
);

export type VpnServerRow = typeof vpnServers.$inferSelect;
