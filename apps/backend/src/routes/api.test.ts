import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { createInMemoryRepositories } from '../test-support/in-memory.js';
import type { InMemoryLedgerRepository } from '../modules/ledger/ledger.repository.js';

describe('API routes (integration via inject)', () => {
  let app: FastifyInstance;
  let ledger: InMemoryLedgerRepository;

  beforeAll(async () => {
    const repos = createInMemoryRepositories();
    ledger = repos.ledger;
    app = await buildServer({ repositories: repos });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/device/register creates a device', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/device/register',
      payload: { installId: 'i1', appVersion: '0.0.1', platform: 'android', language: 'tk' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.deviceId).toBeTruthy();
    expect(body.balanceMinutes).toBe(0);
    expect(body.language).toBe('tk');
  });

  it('POST /api/device/register rejects an invalid payload with the canonical code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/device/register',
      payload: { installId: 'i1' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/app/config returns defaults', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/app/config' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rewardMinutesPerAd).toBe(30);
    expect(body.maxBalanceDays).toBe(365);
  });

  it('GET /api/rewards/balance returns the ledger balance', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/device/register',
      payload: { installId: 'i2', appVersion: '0.0.1', platform: 'android', language: 'ru' },
    });
    const deviceId = reg.json().deviceId as string;
    ledger.add(deviceId, 30);

    const res = await app.inject({
      method: 'GET',
      url: '/api/rewards/balance',
      headers: { 'x-device-id': deviceId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().balanceMinutes).toBe(30);
  });

  it('GET /api/rewards/balance requires the x-device-id header', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/rewards/balance' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/rewards/balance is 404 for an unknown device', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/rewards/balance',
      headers: { 'x-device-id': '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/device/heartbeat updates and returns balance', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/device/register',
      payload: { installId: 'i3', appVersion: '0.0.1', platform: 'android', language: 'ru' },
    });
    const deviceId = reg.json().deviceId as string;
    const res = await app.inject({
      method: 'POST',
      url: '/api/device/heartbeat',
      headers: { 'x-device-id': deviceId },
      payload: { appVersion: '0.0.2' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().deviceId).toBe(deviceId);
    expect(typeof res.json().serverTime).toBe('string');
  });
});
