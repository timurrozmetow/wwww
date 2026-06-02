import { bigint, index, int, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

/**
 * Admin-authored FCM push campaigns (SPEC "Push notifications"). Targeted by
 * language / balance segment / country; the actual send runs in a worker, not
 * the HTTP handler (CLAUDE.md §6). recipient/sent counts are filled on send.
 */
export const pushCampaigns = mysqlTable(
  'push_campaigns',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    title: varchar('title', { length: 128 }).notNull(),
    body: varchar('body', { length: 512 }).notNull(),
    /** null = all languages. */
    language: varchar('language', { length: 8 }),
    segment: varchar('segment', { length: 24 }).notNull().default('all'),
    /** null = all countries. */
    country: varchar('country', { length: 8 }),
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    recipientCount: int('recipient_count').notNull().default(0),
    sentCount: int('sent_count').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    sentAt: timestamp('sent_at'),
  },
  (t) => [index('push_campaigns_status_idx').on(t.status)],
);

export type PushCampaignRow = typeof pushCampaigns.$inferSelect;
