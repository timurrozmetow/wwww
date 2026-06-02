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
 * Admin-managed in-app banners shown on the mobile Home screen, targeted by
 * language / segment / date window / priority (SPEC "In-app banners").
 */
export const inAppBanners = mysqlTable(
  'in_app_banners',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    title: varchar('title', { length: 128 }).notNull(),
    body: varchar('body', { length: 512 }).notNull(),
    imageUrl: varchar('image_url', { length: 512 }),
    deeplink: varchar('deeplink', { length: 255 }),
    /** null = all languages. */
    language: varchar('language', { length: 8 }),
    segment: varchar('segment', { length: 24 }).notNull().default('all'),
    startsAt: timestamp('starts_at'),
    endsAt: timestamp('ends_at'),
    priority: int('priority').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('banners_enabled_idx').on(t.enabled), index('banners_language_idx').on(t.language)],
);

export type InAppBannerRow = typeof inAppBanners.$inferSelect;
