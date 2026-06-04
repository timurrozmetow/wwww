import { describe, expect, it, vi } from 'vitest';
import { VpnHealthService } from '../vpn/vpn-health.service.js';
import { InMemoryVpnProviderRepository } from '../vpn/vpn-provider.repository.js';
import { InMemoryVpnServerRepository } from '../vpn/vpn-server.repository.js';
import { AdminVpnService } from './admin-vpn.service.js';
import { InMemoryAuditLogRepository } from './admin.repository.js';

async function setup() {
  const providers = new InMemoryVpnProviderRepository();
  const servers = new InMemoryVpnServerRepository();
  const audit = new InMemoryAuditLogRepository();
  const provider = await providers.create({ name: 'P', type: 'happ' });
  const up = await servers.create({
    providerId: provider.id,
    country: 'NL',
    name: 'Up',
    host: 'up.example.com',
    configBlob: JSON.stringify({ outbounds: [{ server_port: 8443 }] }),
  });
  const down = await servers.create({
    providerId: provider.id,
    country: 'US',
    name: 'Down',
    host: 'down.example.com',
  });
  return { providers, servers, audit, up, down };
}

describe('AdminVpnService.pingAll', () => {
  it('measures latency, updates pingMs/status, and reads port from configBlob', async () => {
    const { providers, servers, audit, up, down } = await setup();
    const pinger = vi.fn(async (host: string) => (host === 'up.example.com' ? 42 : null));
    const health = new VpnHealthService(servers, pinger);
    const svc = new AdminVpnService(providers, servers, audit, {}, undefined, health);

    const res = await svc.pingAll(1);

    expect(res.checked).toBe(2);
    // port came from the configBlob, not the default
    expect(pinger).toHaveBeenCalledWith('up.example.com', 8443);
    expect(pinger).toHaveBeenCalledWith('down.example.com', 443);

    const upRes = res.results.find((r) => r.id === up.id)!;
    const downRes = res.results.find((r) => r.id === down.id)!;
    expect(upRes).toMatchObject({ pingMs: 42, status: 'online' });
    expect(downRes).toMatchObject({ pingMs: null, status: 'offline' });

    // persisted to the repo
    const upRow = await servers.findById(up.id);
    const downRow = await servers.findById(down.id);
    expect(upRow).toMatchObject({ pingMs: 42, status: 'online', recentFailures: 0 });
    expect(downRow).toMatchObject({ status: 'offline', recentFailures: 1 });
  });

  it('only pings enabled servers', async () => {
    const { providers, servers, audit, up, down } = await setup();
    await servers.setEnabled(down.id, false);
    const pinger = vi.fn(async () => 10);
    const svc = new AdminVpnService(providers, servers, audit, {}, undefined, new VpnHealthService(servers, pinger));

    const res = await svc.pingAll(1);

    expect(res.checked).toBe(1);
    expect(res.results[0]!.id).toBe(up.id);
    expect(pinger).toHaveBeenCalledTimes(1);
  });
});
