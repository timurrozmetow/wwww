import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

export type Db = MySql2Database<typeof schema>;

let pool: mysql.Pool | undefined;
let db: Db | undefined;

/**
 * Lazily creates the shared connection pool + Drizzle instance. mysql2 pools
 * connect on first query, so importing this module (build, tests) never dials
 * the database. Callers that don't need the DB (e.g. `/health`) never trigger it.
 */
export function getDb(): Db {
  if (!db) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — cannot create a database connection');
    }
    pool = mysql.createPool(env.DATABASE_URL);
    db = drizzle(pool, { schema, mode: 'default' });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  db = undefined;
}
