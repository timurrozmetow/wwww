import { mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';

/**
 * Key/value remote config (CLAUDE.md §8: business numbers live here, not as
 * magic constants). Values are stored as text + a `valueType` hint; the service
 * layer overlays them onto typed defaults.
 */
export const remoteConfig = mysqlTable('remote_config', {
  key: varchar('config_key', { length: 64 }).primaryKey(),
  value: text('value').notNull(),
  valueType: varchar('value_type', { length: 16 }).notNull().default('string'),
  description: varchar('description', { length: 255 }),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  updatedBy: varchar('updated_by', { length: 64 }),
});

export type RemoteConfigRow = typeof remoteConfig.$inferSelect;
