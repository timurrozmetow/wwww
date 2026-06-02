/**
 * Seed a placeholder VPN provider + servers. Usage:
 *   pnpm --filter @vpn/backend vpn:seed
 * Real subscription keys/configs are managed via the admin panel (encrypted).
 */
import { closeDb, getDb } from '../db/client.js';
import { vpnProviders, vpnServers } from '../db/schema/index.js';
import { SEED_PROVIDER_ID, buildSeedServers } from '../modules/vpn/seed.js';

async function main(): Promise<void> {
  const db = getDb();
  await db.insert(vpnProviders).values({
    id: SEED_PROVIDER_ID,
    name: 'Placeholder Provider',
    type: 'subscription',
    subscriptionSecret: 'VLESS_PLACEHOLDER',
  });
  for (const s of buildSeedServers()) {
    await db.insert(vpnServers).values({
      id: s.id,
      providerId: s.providerId,
      country: s.country,
      city: s.city,
      name: s.name,
      host: s.host,
      configBlob: s.configBlob,
      pingMs: s.pingMs,
      loadPercent: s.loadPercent,
      status: s.status,
      countryPriority: s.countryPriority,
    });
  }
  console.log(`Seeded VPN provider + ${buildSeedServers().length} servers`);
  await closeDb();
}

void main();
