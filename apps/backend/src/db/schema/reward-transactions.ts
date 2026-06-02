import {
  bigint,
  index,
  int,
  json,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

/**
 * Audit trail for granted rewards + the raw provider callback (CLAUDE.md §6).
 * `transaction_id` is unique, but the authoritative idempotency gate is the
 * ledger's unique `reference_id`; this table is the diagnostic record.
 */
export const rewardTransactions = mysqlTable(
  'reward_transactions',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    transactionId: varchar('transaction_id', { length: 128 }).notNull(),
    deviceId: varchar('device_id', { length: 36 }).notNull(),
    sessionId: varchar('session_id', { length: 36 }),
    source: varchar('source', { length: 32 }).notNull(),
    minutes: int('minutes').notNull(),
    rawCallback: json('raw_callback'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reward_tx_transaction_uq').on(t.transactionId),
    index('reward_tx_device_idx').on(t.deviceId),
  ],
);

export type RewardTransactionRow = typeof rewardTransactions.$inferSelect;
