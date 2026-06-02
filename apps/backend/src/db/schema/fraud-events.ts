import { bigint, index, int, json, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

/**
 * Anti-fraud signal log (CLAUDE.md §9). Every heuristic hit — emulator/root,
 * failed integrity, reward velocity — is appended here with the score delta it
 * added, so the admin can audit why a device's fraud_score is what it is.
 * NEVER stores raw integrity tokens or any traffic content (§9 privacy).
 */
export const fraudEvents = mysqlTable(
  'fraud_events',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    deviceId: varchar('device_id', { length: 36 }).notNull(),
    eventType: varchar('event_type', { length: 48 }).notNull(),
    /** Score delta this event added to the device's fraud_score. */
    severity: int('severity').notNull().default(0),
    source: varchar('source', { length: 24 }).notNull(),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('fraud_events_device_idx').on(t.deviceId),
    index('fraud_events_created_idx').on(t.createdAt),
    index('fraud_events_type_idx').on(t.eventType),
  ],
);

export type FraudEventRow = typeof fraudEvents.$inferSelect;
