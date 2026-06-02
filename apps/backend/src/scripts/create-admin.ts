/**
 * Seed an admin user. Usage:
 *   pnpm --filter @vpn/backend admin:create <email> <password> [role]
 * Falls back to ADMIN_EMAIL / ADMIN_PASSWORD env vars.
 */
import { closeDb, getDb } from '../db/client.js';
import { admins } from '../db/schema/index.js';
import { hashPassword } from '../lib/password.js';

async function main(): Promise<void> {
  const email = process.argv[2] ?? process.env.ADMIN_EMAIL;
  const password = process.argv[3] ?? process.env.ADMIN_PASSWORD;
  const role = process.argv[4] ?? 'admin';

  if (!email || !password) {
    console.error('Usage: tsx src/scripts/create-admin.ts <email> <password> [role]');
    process.exit(1);
  }

  await getDb()
    .insert(admins)
    .values({ email, passwordHash: hashPassword(password), role });
  console.log(`Created admin: ${email} (${role})`);
  await closeDb();
}

void main();
