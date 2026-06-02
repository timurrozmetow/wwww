import {
  bigint,
  boolean,
  index,
  int,
  mysqlTable,
  timestamp,
  varchar,
} from 'drizzle-orm/mysql-core';

/**
 * Every emergency-access decision (grant or deny) is logged for the admin and
 * anti-abuse (CLAUDE.md §7.7 / SPEC "Emergency Free Access").
 */
export const emergencyAccessLogs = mysqlTable(
  'emergency_access_logs',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    deviceId: varchar('device_id', { length: 36 }).notNull(),
    granted: boolean('granted').notNull(),
    minutes: int('minutes').notNull().default(0),
    reason: varchar('reason', { length: 32 }).notNull(),
    failedNetworks: int('failed_networks').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('emergency_logs_device_created_idx').on(t.deviceId, t.createdAt),
    index('emergency_logs_created_idx').on(t.createdAt),
  ],
);

export type EmergencyAccessLogRow = typeof emergencyAccessLogs.$inferSelect;
