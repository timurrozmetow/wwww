import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../server.js';
import {
  createInMemoryRepositories,
  type InMemoryRepositories,
} from '../../test-support/in-memory.js';
import { InMemoryVpnSessionStore } from './vpn-session-store.js';
import {
  DuplicateActiveSessionError,
  InMemoryVpnSessionRepository,
} from './vpn-session.repository.js';

interface Ctx {
  app: FastifyInstance;
  deviceId: string;
  repos: InMemoryRepositories;
  store: InMemoryVpnSessionStore;
}

async function setup(balanceMinutes = 0): Promise<Ctx> {
  const repos = createInMemoryRepositories();
  const store = new InMemoryVpnSessionStore();
  const app = await buildServer({ repositories: repos, vpnSessionStore: store });
  await app.ready();
  const reg = await app.inject({
    method: 'POST',
    url: '/api/device/register',
    payload: { installId: 'i1', appVersion: '0.0.1', platform: 'android', language: 'ru' },
  });
  const deviceId = reg.json().deviceId as string;
  if (balanceMinutes > 0) repos.ledger.add(deviceId, balanceMinutes);
  return { app, deviceId, repos, store };
}

function startSession(app: FastifyInstance, deviceId: string) {
  return app.inject({
    method: 'POST',
    url: '/api/vpn/session/start',
    headers: { 'x-device-id': deviceId },
    payload: {},
  });
}

describe('VPN catalog', () => {
  it('GET /api/vpn/servers returns a safe view and never leaks host/config', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/vpn/servers' });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty('quality');
    expect(res.body).not.toContain('VLESS_PLACEHOLDER');
    expect(res.body).not.toContain('placeholder.example');
    await app.close();
  });

  it('GET /api/vpn/recommended picks the lowest-score online server', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/vpn/recommended' });
    expect(res.statusCode).toBe(200);
    expect(res.json().server.id).toBe('srv-tm-1');
    expect(res.json().server.recommended).toBe(true);
    await app.close();
  });
});

describe('VPN session', () => {
  it('rejects start with zero balance (403 INSUFFICIENT_BALANCE)', async () => {
    const { app, deviceId } = await setup(0);
    const res = await startSession(app, deviceId);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('INSUFFICIENT_BALANCE');
    await app.close();
  });

  it('starts with a server-time deadline and a session token', async () => {
    const { app, deviceId } = await setup(60);
    const res = await startSession(app, deviceId);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sessionId).toBeTruthy();
    expect(body.sessionToken).toBeTruthy();
    expect(body.remainingSeconds).toBeGreaterThan(3500);
    expect(body.remainingSeconds).toBeLessThanOrEqual(3600);
    await app.close();
  });

  it('heartbeat returns remaining time and rejects a bad token (401)', async () => {
    const { app, deviceId } = await setup(60);
    const start = (await startSession(app, deviceId)).json();
    const hb = await app.inject({
      method: 'POST',
      url: '/api/vpn/session/heartbeat',
      payload: { sessionId: start.sessionId, sessionToken: start.sessionToken, bytesIn: 1000 },
    });
    expect(hb.statusCode).toBe(200);
    expect(hb.json().shouldDisconnect).toBe(false);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/vpn/session/heartbeat',
      payload: { sessionId: start.sessionId, sessionToken: 'wrong' },
    });
    expect(bad.statusCode).toBe(401);
    await app.close();
  });

  it('heartbeat past the deadline disconnects and finalizes the session', async () => {
    const { app, deviceId, store } = await setup(60);
    const start = (await startSession(app, deviceId)).json();
    const live = await store.get(start.sessionId);
    if (!live) throw new Error('live session missing');
    live.deadlineMs = Date.now() - 1000;
    live.startedAtMs -= 60_000;
    await store.put(live);

    const hb = await app.inject({
      method: 'POST',
      url: '/api/vpn/session/heartbeat',
      payload: { sessionId: start.sessionId, sessionToken: start.sessionToken },
    });
    expect(hb.json().shouldDisconnect).toBe(true);

    const cur = await app.inject({
      method: 'GET',
      url: '/api/vpn/session/current',
      headers: { 'x-device-id': deviceId },
    });
    expect(cur.statusCode).toBe(404);
    await app.close();
  });

  it('stop debits elapsed usage once and is idempotent', async () => {
    const { app, deviceId, repos, store } = await setup(60);
    const start = (await startSession(app, deviceId)).json();
    // Backdate ~1.5 min (mid-minute → unambiguous ceil = 2, no boundary flake).
    const live = await store.get(start.sessionId);
    if (!live) throw new Error('live session missing');
    live.startedAtMs -= 90_000;
    await store.put(live);

    const stop1 = await app.inject({
      method: 'POST',
      url: '/api/vpn/session/stop',
      payload: { sessionId: start.sessionId, sessionToken: start.sessionToken },
    });
    expect(stop1.statusCode).toBe(200);
    expect(stop1.json().minutesDebited).toBe(2);
    expect(stop1.json().balanceMinutes).toBe(58);

    const stop2 = await app.inject({
      method: 'POST',
      url: '/api/vpn/session/stop',
      payload: { sessionId: start.sessionId, sessionToken: start.sessionToken },
    });
    expect(stop2.statusCode).toBe(200);
    expect(stop2.json().minutesDebited).toBe(2);
    expect(await repos.ledger.getBalance(deviceId)).toBe(58);
    await app.close();
  });

  it('rejects start on an offline/degraded server (explicit serverId)', async () => {
    const { app, deviceId } = await setup(60);
    const res = await app.inject({
      method: 'POST',
      url: '/api/vpn/session/start',
      headers: { 'x-device-id': deviceId },
      payload: { serverId: 'srv-de-1' }, // seeded as status 'degraded'
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('reuses the active session on a second start (one active per device)', async () => {
    const { app, deviceId } = await setup(60);
    const first = (await startSession(app, deviceId)).json();
    const second = (await startSession(app, deviceId)).json();
    expect(second.sessionId).toBe(first.sessionId);
    await app.close();
  });

  it('stop after the live key is evicted still finalizes and debits from the row', async () => {
    const { app, deviceId, repos, store } = await setup(60);
    const start = (await startSession(app, deviceId)).json();
    // Backdate ~2.5 min (mid-minute → ceil = 3), then evict the live key (TTL).
    const row = await repos.vpnSessions.findById(start.sessionId);
    if (!row) throw new Error('row missing');
    row.startedAt = new Date(Date.now() - 150_000);
    await store.delete(start.sessionId);

    const stop = await app.inject({
      method: 'POST',
      url: '/api/vpn/session/stop',
      payload: { sessionId: start.sessionId, sessionToken: start.sessionToken },
    });
    expect(stop.statusCode).toBe(200);
    expect(stop.json().minutesDebited).toBe(3);
    expect(stop.json().balanceMinutes).toBe(57);

    const cur = await app.inject({
      method: 'GET',
      url: '/api/vpn/session/current',
      headers: { 'x-device-id': deviceId },
    });
    expect(cur.statusCode).toBe(404);
    await app.close();
  });

  it('GET /api/vpn/session/current is 404 with no session, 200 when active', async () => {
    const { app, deviceId } = await setup(60);
    const none = await app.inject({
      method: 'GET',
      url: '/api/vpn/session/current',
      headers: { 'x-device-id': deviceId },
    });
    expect(none.statusCode).toBe(404);

    await startSession(app, deviceId);
    const cur = await app.inject({
      method: 'GET',
      url: '/api/vpn/session/current',
      headers: { 'x-device-id': deviceId },
    });
    expect(cur.statusCode).toBe(200);
    expect(cur.json().remainingSeconds).toBeGreaterThan(0);
    await app.close();
  });
});

describe('VpnSessionRepository (in-memory)', () => {
  const future = (): Date => new Date(Date.now() + 3_600_000);

  it('enforces one active session per device and frees it after finalize', async () => {
    const repo = new InMemoryVpnSessionRepository();
    await repo.create({
      id: 's1',
      deviceId: 'd1',
      serverId: 'srv',
      token: 't1',
      allottedMinutes: 60,
      deadline: future(),
    });
    await expect(
      repo.create({
        id: 's2',
        deviceId: 'd1',
        serverId: 'srv',
        token: 't2',
        allottedMinutes: 60,
        deadline: future(),
      }),
    ).rejects.toBeInstanceOf(DuplicateActiveSessionError);

    // A different device is unaffected.
    await repo.create({
      id: 's3',
      deviceId: 'd2',
      serverId: 'srv',
      token: 't3',
      allottedMinutes: 60,
      deadline: future(),
    });

    // Finalizing frees the slot, so the device can start again.
    await repo.finalize('s1', {
      status: 'ended',
      minutesDebited: 1,
      bytesIn: 0,
      bytesOut: 0,
      endedAt: new Date(),
      disconnectReason: 'user_stopped',
    });
    await repo.create({
      id: 's4',
      deviceId: 'd1',
      serverId: 'srv',
      token: 't4',
      allottedMinutes: 60,
      deadline: future(),
    });
    expect((await repo.findActiveByDevice('d1'))?.id).toBe('s4');
  });
});
