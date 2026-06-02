/**
 * Seed the default ad mediation waterfall (10 providers). Usage:
 *   pnpm --filter @vpn/backend ads:seed
 * Idempotent on provider_key (skips ones already present). Real ad unit ids are
 * set later via env / the admin panel; seeds ship with placeholders (§7).
 */
import { closeDb, getDb } from '../db/client.js';
import { adProviders } from '../db/schema/index.js';
import { buildSeedAdProviders } from '../modules/ads/ad-provider.seed.js';

async function main(): Promise<void> {
  const db = getDb();
  const existing = await db.select({ key: adProviders.key }).from(adProviders);
  const present = new Set(existing.map((r) => r.key));

  let inserted = 0;
  for (const p of buildSeedAdProviders()) {
    if (present.has(p.key)) continue;
    await db.insert(adProviders).values({
      key: p.key,
      name: p.name,
      priority: p.priority,
      ecpmEstimate: p.ecpmEstimate,
      fillRate: p.fillRate,
      adUnitId: p.adUnitId,
      timeoutMs: p.timeoutMs ?? 5000,
      enabled: p.enabled ?? true,
    });
    inserted += 1;
  }
  console.log(`Seeded ${inserted} ad provider(s) (${present.size} already present)`);
  await closeDb();
}

void main();
