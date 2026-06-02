import { index, int, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

/**
 * One row per ad-watch attempt. Its `id` is handed to the ad SDK as SSV custom
 * data so the server-side callback can map back to a device. Status moves
 * pending → rewarded (or expired/failed).
 */
export const adSessions = mysqlTable(
  'ad_sessions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    deviceId: varchar('device_id', { length: 36 }).notNull(),
    provider: varchar('provider', { length: 32 }).notNull().default('admob'),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    rewardMinutes: int('reward_minutes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    rewardedAt: timestamp('rewarded_at'),
  },
  (t) => [
    index('ad_sessions_device_created_idx').on(t.deviceId, t.createdAt),
    index('ad_sessions_status_idx').on(t.status),
  ],
);

export type AdSessionRow = typeof adSessions.$inferSelect;
