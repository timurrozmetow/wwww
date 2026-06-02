import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../server.js';
import { createInMemoryRepositories } from '../../test-support/in-memory.js';
import { SEED_PROVIDER_ID } from '../vpn/seed.js';
import { AdminAuthService } from './admin-auth.service.js';

async function setup(): Promise<{ app: FastifyInstance; headers: Record<string, string> }> {
  const repos = createInMemoryRepositories();
  await new AdminAuthService(repos.admins).createAdmin('admin@test', 'secret123', 'admin');
  const app = await buildServer({ repositories: repos });
  await app.ready();
  const login = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { email: 'admin@test', password: 'secret123' },
  });
  return { app, headers: { authorization: `Bearer ${login.json().token as string}` } };
}

describe('Admin VPN management', () => {
  it('requires auth', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/admin/vpn/servers' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('lists seeded providers (with server counts) and servers', async () => {
    const { app, headers } = await setup();
    const providers = await app.inject({ method: 'GET', url: '/api/admin/vpn/providers', headers });
    expect(providers.statusCode).toBe(200);
    expect(providers.json()).toHaveLength(1);
    expect(providers.json()[0].serverCount).toBe(3);

    const servers = await app.inject({ method: 'GET', url: '/api/admin/vpn/servers', headers });
    expect(servers.json()).toHaveLength(3);
    // Admin view DOES include host/status (unlike the public client view).
    expect(servers.json()[0]).toHaveProperty('host');
    expect(servers.json()[0]).toHaveProperty('status');
    await app.close();
  });

  it('creates, toggles and deletes a server (audited)', async () => {
    const { app, headers } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/vpn/servers',
      headers,
      payload: { providerId: SEED_PROVIDER_ID, country: 'NL', name: 'Amsterdam 1', pingMs: 50 },
    });
    expect(created.statusCode).toBe(200);
    const serverId = created.json().id as string;
    expect(created.json().enabled).toBe(true);

    // Disabling removes it from the public (client) catalog.
    await app.inject({
      method: 'POST',
      url: `/api/admin/vpn/servers/${serverId}/toggle`,
      headers,
      payload: { enabled: false },
    });
    const publicList = await app.inject({ method: 'GET', url: '/api/vpn/servers' });
    expect(publicList.json().some((s: { id: string }) => s.id === serverId)).toBe(false);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/admin/vpn/servers/${serverId}`,
      headers,
    });
    expect(del.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: '/api/admin/vpn/servers', headers });
    expect(after.json().some((s: { id: string }) => s.id === serverId)).toBe(false);

    // 4 audited actions: create, disable, delete (+ login is not audited).
    const logs = await app.inject({ method: 'GET', url: '/api/admin/logs', headers });
    const actions = logs.json().map((l: { action: string }) => l.action);
    expect(actions).toContain('vpn.server.create');
    expect(actions).toContain('vpn.server.disable');
    expect(actions).toContain('vpn.server.delete');
    await app.close();
  });

  it('rejects a server for an unknown provider (404)', async () => {
    const { app, headers } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/vpn/servers',
      headers,
      payload: { providerId: 'nope', country: 'NL', name: 'X' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('creates and toggles a provider', async () => {
    const { app, headers } = await setup();
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/vpn/providers',
      headers,
      payload: { name: 'New Provider', priority: 50 },
    });
    expect(created.statusCode).toBe(200);
    const id = created.json().id as string;

    const toggled = await app.inject({
      method: 'POST',
      url: `/api/admin/vpn/providers/${id}/toggle`,
      headers,
      payload: { enabled: false },
    });
    expect(toggled.statusCode).toBe(200);

    const providers = await app.inject({ method: 'GET', url: '/api/admin/vpn/providers', headers });
    const found = providers.json().find((p: { id: string }) => p.id === id);
    expect(found.enabled).toBe(false);
    await app.close();
  });
});
