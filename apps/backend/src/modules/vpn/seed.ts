import type { VpnProviderRow, VpnServerRow } from '../../db/schema/index.js';

export const SEED_PROVIDER_ID = '00000000-0000-0000-0000-0000000000aa';

export function buildSeedProviders(): VpnProviderRow[] {
  return [
    {
      id: SEED_PROVIDER_ID,
      name: 'Placeholder Provider',
      type: 'subscription',
      subscriptionSecret: 'VLESS_PLACEHOLDER',
      priority: 100,
      enabled: true,
      lastSyncAt: null,
      createdAt: new Date(),
    },
  ];
}

/**
 * Placeholder servers (no real keys — config is a placeholder token, §7).
 * Used to seed the DB (`vpn:seed`) and the in-memory test repositories.
 */
export function buildSeedServers(): VpnServerRow[] {
  const now = new Date();
  const base = {
    providerId: SEED_PROVIDER_ID,
    host: 'placeholder.example',
    configBlob: 'VLESS_PLACEHOLDER',
    recentFailures: 0,
    priority: 100,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
  return [
    {
      id: 'srv-tm-1',
      country: 'TM',
      city: 'Ashgabat',
      name: 'Ashgabat 1',
      pingMs: 35,
      loadPercent: 20,
      status: 'online',
      countryPriority: 10,
      ...base,
    },
    {
      id: 'srv-tr-1',
      country: 'TR',
      city: 'Istanbul',
      name: 'Istanbul 1',
      pingMs: 80,
      loadPercent: 55,
      status: 'online',
      countryPriority: 50,
      ...base,
    },
    {
      id: 'srv-de-1',
      country: 'DE',
      city: 'Frankfurt',
      name: 'Frankfurt 1',
      pingMs: 140,
      loadPercent: 85,
      status: 'degraded',
      countryPriority: 80,
      ...base,
    },
  ];
}
