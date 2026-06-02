import { bigint, mysqlTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';

/** Admin-panel users. No self-registration — seeded via the create-admin CLI. */
export const admins = mysqlTable(
  'admins',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    email: varchar('email', { length: 191 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: varchar('role', { length: 16 }).notNull().default('admin'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at'),
  },
  (t) => [uniqueIndex('admins_email_uq').on(t.email)],
);

export type AdminRow = typeof admins.$inferSelect;
