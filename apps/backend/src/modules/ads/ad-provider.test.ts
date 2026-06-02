import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../server.js';
import {
  createInMemoryRepositories,
  type InMemoryRepositories,
} from '../../test-support/in-memory.js';
import { AdminAuthService } from '../admin/admin-auth.service.js';

async function setup(): Promise<{
  app: FastifyInstance;
  repos: InMemoryRepositories;
  headers: Record<string, string>;
}> {
  const repos = createInMemoryRepositories();
  await new AdminAuthService(repos.admins).createAdmin('admin@test', 'secret123', 'admin');
  const app = await buildServer({ repositories: repos });
  await app.ready();
  const login = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { email: 'admin@test', password: 'secret123' },
  });
  return { app, repos, headers: { authorization: `Bearer ${login.json().token as string}` } };
}

describe('GET /api/ads/waterfall-config (client)', () => {
  it('returns the 10 seeded providers in priority order', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/ads/waterfall-config' });
    expect(res.statusCode).toBe(200);
    const providers = res.json().providers;
    expect(providers).toHaveLength(10);
    expect(providers[0].key).toBe('applovin');
    expect(providers[9].key).toBe('chartboost');
    const priorities = providers.map((p: { priority: number }) => p.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
    await app.close();
  });

  it('never leaks eCPM / fill rate to the client', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/ads/waterfall-config' });
    const item = res.json().providers[0];
    expect(item).toHaveProperty('adUnitId');
    expect(item).toHaveProperty('timeoutMs');
    expect(item).not.toHaveProperty('ecpmEstimate');
    expect(item).not.toHaveProperty('fillRate');
    expect(item).not.toHaveProperty('enabled');
    await app.close();
  });

  it('excludes disabled providers (order changes without a release)', async () => {
    const { app, repos } = await setup();
    // Disable the top provider directly via the repo (id 1 = applovin).
    await repos.adProviders.update(1, { enabled: false });
    const res = await app.inject({ method: 'GET', url: '/api/ads/waterfall-config' });
    const keys = res.json().providers.map((p: { key: string }) => p.key);
    expect(keys).toHaveLength(9);
    expect(keys).not.toContain('applovin');
    expect(keys[0]).toBe('admob');
    await app.close();
  });
});

describe('Admin ad providers', () => {
  it('requires auth', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/admin/ads/providers' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('lists providers with economics (admin view)', async () => {
    const { app, headers } = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/admin/ads/providers', headers });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list).toHaveLength(10);
    expect(list[0]).toHaveProperty('ecpmEstimate');
    expect(list[0]).toHaveProperty('fillRate');
    await app.close();
  });

  it('updates priority — reflected in the client waterfall order (audited)', async () => {
    const { app, headers } = await setup();
    // Move chartboost (id 10, priority 10) to the front.
    const updated = await app.inject({
      method: 'PATCH',
      url: '/api/admin/ads/providers/10',
      headers,
      payload: { priority: 0 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().priority).toBe(0);

    const res = await app.inject({ method: 'GET', url: '/api/ads/waterfall-config' });
    expect(res.json().providers[0].key).toBe('chartboost');

    const logs = await app.inject({ method: 'GET', url: '/api/admin/logs', headers });
    expect(logs.json().map((l: { action: string }) => l.action)).toContain('ad_provider.update');
    await app.close();
  });

  it('toggles a provider off — dropped from the client waterfall (audited)', async () => {
    const { app, headers } = await setup();
    const toggled = await app.inject({
      method: 'POST',
      url: '/api/admin/ads/providers/2/toggle',
      headers,
      payload: { enabled: false },
    });
    expect(toggled.statusCode).toBe(200);

    const res = await app.inject({ method: 'GET', url: '/api/ads/waterfall-config' });
    expect(res.json().providers.some((p: { key: string }) => p.key === 'admob')).toBe(false);

    const logs = await app.inject({ method: 'GET', url: '/api/admin/logs', headers });
    expect(logs.json().map((l: { action: string }) => l.action)).toContain('ad_provider.disable');
    await app.close();
  });

  it('rejects an empty update body (400)', async () => {
    const { app, headers } = await setup();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/ads/providers/1',
      headers,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 404 for an unknown provider', async () => {
    const { app, headers } = await setup();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/ads/providers/999',
      headers,
      payload: { priority: 1 },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
