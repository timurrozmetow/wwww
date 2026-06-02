import {
  boolean,
  index,
  int,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

/**
 * Anonymous device profile (no registration). `id` is the server-issued
 * device_id the client caches and sends back. The real minute balance is the
 * ledger sum; `balanceMinutesCache` is only a denormalized convenience.
 */
export const devices = mysqlTable(
  'devices',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    installId: varchar('install_id', { length: 64 }).notNull(),
    appVersion: varchar('app_version', { length: 32 }).notNull(),
    platform: varchar('platform', { length: 16 }).notNull().default('android'),
    language: varchar('language', { length: 8 }).notNull(),
    country: varchar('country', { length: 8 }),
    timezone: varchar('timezone', { length: 64 }),
    deviceIntegrityStatus: varchar('device_integrity_status', { length: 32 }),
    fraudScore: int('fraud_score').notNull().default(0),
    isBlocked: boolean('is_blocked').notNull().default(false),
    balanceMinutesCache: int('balance_minutes_cache').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex('devices_install_id_uq').on(t.installId),
    index('devices_country_idx').on(t.country),
    index('devices_language_idx').on(t.language),
    index('devices_last_seen_idx').on(t.lastSeenAt),
    index('devices_is_blocked_idx').on(t.isBlocked),
  ],
);

export type DeviceRow = typeof devices.$inferSelect;
export type DeviceInsert = typeof devices.$inferInsert;
