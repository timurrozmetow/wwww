import { bigint, index, json, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

/** Every admin action is recorded here (CLAUDE.md §6/§9). */
export const adminAuditLogs = mysqlTable(
  'admin_audit_logs',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    adminId: bigint('admin_id', { mode: 'number' }).notNull(),
    action: varchar('action', { length: 64 }).notNull(),
    targetType: varchar('target_type', { length: 32 }),
    targetId: varchar('target_id', { length: 64 }),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('admin_audit_admin_idx').on(t.adminId),
    index('admin_audit_created_idx').on(t.createdAt),
  ],
);

export type AdminAuditLogRow = typeof adminAuditLogs.$inferSelect;
