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
 * Append-only minute ledger — the source of truth for a device's balance
 * (CLAUDE.md §7.5: balance = signed SUM(minutes)). Never updated/deleted.
 *
 * `reference_id` is a GLOBAL idempotency key: a credit can only land once,
 * regardless of entry_type (CLAUDE.md §7.4 — a callback can't credit twice, and
 * the same transaction_id can't be replayed as a different type). Callers must
 * make it globally unique: the provider transaction_id for `reward_ad`; a
 * device-namespaced key like `emergency:<deviceId>:<date>` for emergency/admin;
 * `vpn_usage:<sessionId>` for VPN usage (debited at most once per session).
 * Only entries with no natural idempotency key leave it NULL — MySQL treats
 * NULLs as distinct, so those never collide.
 */
export const minuteLedger = mysqlTable(
  'minute_ledger',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    deviceId: varchar('device_id', { length: 36 }).notNull(),
    entryType: varchar('entry_type', { length: 32 }).notNull(),
    /** Signed minutes: +30 reward, +15 emergency, -N usage, ± adjustment. */
    minutes: int('minutes').notNull(),
    /** transaction_id / session_id for idempotency + tracing. */
    referenceId: varchar('reference_id', { length: 128 }),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    /** When these minutes expire (accumulation capped at ~1 year). */
    expiresAt: timestamp('expires_at'),
  },
  (t) => [
    index('ledger_device_created_idx').on(t.deviceId, t.createdAt),
    uniqueIndex('ledger_reference_uq').on(t.referenceId),
  ],
);

export type LedgerRow = typeof minuteLedger.$inferSelect;
export type LedgerInsert = typeof minuteLedger.$inferInsert;
