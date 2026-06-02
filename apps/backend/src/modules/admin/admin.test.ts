import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../server.js';
import { createInMemoryRepositories } from '../../test-support/in-memory.js';
import { AdminAuthService } from './admin-auth.service.js';

async function setup(): Promise<{ app: FastifyInstance }> {
  const repos = createInMemoryRepositories();
  await new AdminAuthService(repos.admins).createAdmin('admin@test', 'secret123', 'admin');
  const app = await buildServer({ repositories: repos });
  await app.ready();
  return { app };
}

async function login(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { email: 'admin@test', password: 'secret123' },
  });
  return res.json().token as string;
}

async function registerDevice(app: FastifyInstance, installId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/device/register',
    payload: { installId, appVersion: '0.0.1', platform: 'android', language: 'ru' },
  });
  return res.json().deviceId as string;
}

describe('Admin API', () => {
  it('rejects bad credentials with 401 UNAUTHORIZED', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'admin@test', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    await app.close();
  });

  it('logs in and returns a token + profile without the password hash', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'admin@test', password: 'secret123' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.token).toBe('string');
    expect(body.admin.email).toBe('admin@test');
    expect(body.admin.passwordHash).toBeUndefined();
    await app.close();
  });

  it('guards admin routes without a token (401)', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/admin/dashboard' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns dashboard and device list with a valid token', async () => {
    const { app } = await setup();
    await registerDevice(app, 'i1');
    const token = await login(app);
    const headers = { authorization: `Bearer ${token}` };

    const dash = await app.inject({ method: 'GET', url: '/api/admin/dashboard', headers });
    expect(dash.statusCode).toBe(200);
    expect(dash.json().totalDevices).toBe(1);

    const list = await app.inject({ method: 'GET', url: '/api/admin/devices', headers });
    expect(list.json().items).toHaveLength(1);
    expect(list.json().total).toBe(1);
    await app.close();
  });

  it('blocks/unblocks a device and writes audit logs', async () => {
    const { app } = await setup();
    const deviceId = await registerDevice(app, 'i1');
    const token = await login(app);
    const headers = { authorization: `Bearer ${token}` };

    const blocked = await app.inject({
      method: 'POST',
      url: `/api/admin/devices/${deviceId}/block`,
      headers,
    });
    expect(blocked.statusCode).toBe(200);

    // The block is enforced on the public balance endpoint.
    const balBlocked = await app.inject({
      method: 'GET',
      url: '/api/rewards/balance',
      headers: { 'x-device-id': deviceId },
    });
    expect(balBlocked.statusCode).toBe(403);

    await app.inject({ method: 'POST', url: `/api/admin/devices/${deviceId}/unblock`, headers });
    const balOk = await app.inject({
      method: 'GET',
      url: '/api/rewards/balance',
      headers: { 'x-device-id': deviceId },
    });
    expect(balOk.statusCode).toBe(200);

    const logs = await app.inject({ method: 'GET', url: '/api/admin/logs', headers });
    expect(logs.json()).toHaveLength(2);
    await app.close();
  });

  it('banners: admin creates → client sees targeted view → toggle/delete hides it', async () => {
    const { app } = await setup();
    const deviceId = await registerDevice(app, 'i1'); // registers with language 'ru'
    const headers = { authorization: `Bearer ${await login(app)}` };

    const unauth = await app.inject({ method: 'GET', url: '/api/admin/banners' });
    expect(unauth.statusCode).toBe(401);

    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/banners',
      headers,
      payload: { title: 'Hello', body: 'World', language: 'ru', segment: 'all', priority: 1 },
    });
    expect(created.statusCode).toBe(200);
    const bannerId = created.json().id as number;

    const seen = await app.inject({
      method: 'GET',
      url: '/api/notifications/in-app',
      headers: { 'x-device-id': deviceId },
    });
    expect(seen.statusCode).toBe(200);
    expect(seen.json().some((b: { id: number }) => b.id === bannerId)).toBe(true);
    // Client view must NOT leak targeting fields.
    expect(seen.json()[0]).not.toHaveProperty('segment');
    expect(seen.json()[0]).not.toHaveProperty('enabled');

    await app.inject({
      method: 'POST',
      url: `/api/admin/banners/${bannerId}/toggle`,
      headers,
      payload: { enabled: false },
    });
    const hidden = await app.inject({
      method: 'GET',
      url: '/api/notifications/in-app',
      headers: { 'x-device-id': deviceId },
    });
    expect(hidden.json().some((b: { id: number }) => b.id === bannerId)).toBe(false);

    await app.inject({ method: 'DELETE', url: `/api/admin/banners/${bannerId}`, headers });
    const after = await app.inject({ method: 'GET', url: '/api/admin/banners', headers });
    expect(after.json().some((b: { id: number }) => b.id === bannerId)).toBe(false);
    await app.close();
  });

  it('emergency logs are visible to admin after a no-fill grant', async () => {
    const { app } = await setup();
    const deviceId = await registerDevice(app, 'i1');
    await app.inject({
      method: 'POST',
      url: '/api/ads/no-fill-report',
      headers: { 'x-device-id': deviceId },
      payload: { failedNetworksCount: 10 },
    });

    const unauth = await app.inject({ method: 'GET', url: '/api/admin/emergency/logs' });
    expect(unauth.statusCode).toBe(401);

    const headers = { authorization: `Bearer ${await login(app)}` };
    const logs = await app.inject({ method: 'GET', url: '/api/admin/emergency/logs', headers });
    expect(logs.statusCode).toBe(200);
    expect(logs.json().length).toBeGreaterThan(0);
    expect(logs.json()[0].granted).toBe(true);
    expect(logs.json()[0].deviceId).toBe(deviceId);
    await app.close();
  });

  it('economy overview returns ledger-derived aggregates (auth required)', async () => {
    const { app } = await setup();
    const unauth = await app.inject({ method: 'GET', url: '/api/admin/economy/overview' });
    expect(unauth.statusCode).toBe(401);

    await registerDevice(app, 'i1');
    const headers = { authorization: `Bearer ${await login(app)}` };
    const res = await app.inject({ method: 'GET', url: '/api/admin/economy/overview', headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().totalDevices).toBe(1);
    expect(res.json()).toHaveProperty('rewardMinutesGranted');
    expect(res.json()).toHaveProperty('vpnMinutesUsed');
    await app.close();
  });

  it('remote-config set is audited and reflected in the public app config', async () => {
    const { app } = await setup();
    const headers = { authorization: `Bearer ${await login(app)}` };

    const unauth = await app.inject({ method: 'GET', url: '/api/admin/remote-config' });
    expect(unauth.statusCode).toBe(401);

    const before = await app.inject({ method: 'GET', url: '/api/app/config' });
    expect(before.json().rewardMinutesPerAd).toBe(30);

    const set = await app.inject({
      method: 'PUT',
      url: '/api/admin/remote-config',
      headers,
      payload: { key: 'reward_minutes_per_ad', value: '45', valueType: 'number' },
    });
    expect(set.statusCode).toBe(200);

    // The same repository instance backs the public config → reflected immediately.
    const after = await app.inject({ method: 'GET', url: '/api/app/config' });
    expect(after.json().rewardMinutesPerAd).toBe(45);

    const list = await app.inject({ method: 'GET', url: '/api/admin/remote-config', headers });
    expect(list.json().some((r: { key: string }) => r.key === 'reward_minutes_per_ad')).toBe(true);

    const logs = await app.inject({ method: 'GET', url: '/api/admin/logs', headers });
    expect(logs.json().map((l: { action: string }) => l.action)).toContain('remote_config.set');
    await app.close();
  });

  it('economy calculate returns a projection', async () => {
    const { app } = await setup();
    const headers = { authorization: `Bearer ${await login(app)}` };
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/economy/calculate',
      headers,
      payload: {
        activeUsers: 1000,
        avgVpnHoursPerUserPerDay: 1,
        rewardMinutesPerAd: 30,
        eCPM: 5,
        fillRate: 0.7,
        avgGbPerHour: 0.5,
        trafficCostPerTb: 5,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().adsPerMonth).toBe(60000);
    expect(res.json().expectedRevenue).toBeCloseTo(210, 4);
    await app.close();
  });
});
