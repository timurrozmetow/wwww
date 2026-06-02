import {
  bigint,
  boolean,
  index,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

/** FCM push tokens per device (used from the notifications stage onward). */
export const pushTokens = mysqlTable(
  'push_tokens',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    deviceId: varchar('device_id', { length: 36 }).notNull(),
    token: varchar('token', { length: 255 }).notNull(),
    platform: varchar('platform', { length: 16 }).notNull().default('android'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex('push_tokens_token_uq').on(t.token),
    index('push_tokens_device_idx').on(t.deviceId),
  ],
);

export type PushTokenRow = typeof pushTokens.$inferSelect;
