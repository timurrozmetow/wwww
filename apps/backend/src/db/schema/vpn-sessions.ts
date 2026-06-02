import {
  bigint,
  index,
  int,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

/**
 * Durable record of a VPN session. The live countdown/usage lives in Redis
 * (§14.1/§14.3); this row is created at start and finalized at stop with the
 * debited minutes + traffic totals.
 */
export const vpnSessions = mysqlTable(
  'vpn_sessions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    deviceId: varchar('device_id', { length: 36 }).notNull(),
    /**
     * Equals device_id while active, NULL once finalized. UNIQUE → enforces at
     * most ONE active session per device (NULLs are distinct in MySQL).
     */
    activeDeviceId: varchar('active_device_id', { length: 36 }),
    serverId: varchar('server_id', { length: 36 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    /** Server-issued short-lived token authenticating heartbeat/stop. */
    token: varchar('token', { length: 64 }).notNull(),
    /** Minutes allotted at start (min(balance, cap)). */
    allottedMinutes: int('allotted_minutes').notNull(),
    minutesDebited: int('minutes_debited').notNull().default(0),
    bytesIn: bigint('bytes_in', { mode: 'number' }).notNull().default(0),
    bytesOut: bigint('bytes_out', { mode: 'number' }).notNull().default(0),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    deadline: timestamp('deadline').notNull(),
    endedAt: timestamp('ended_at'),
    disconnectReason: varchar('disconnect_reason', { length: 32 }),
  },
  (t) => [
    uniqueIndex('vpn_sessions_active_device_uq').on(t.activeDeviceId),
    index('vpn_sessions_device_status_idx').on(t.deviceId, t.status),
    index('vpn_sessions_status_idx').on(t.status),
  ],
);

export type VpnSessionRow = typeof vpnSessions.$inferSelect;
