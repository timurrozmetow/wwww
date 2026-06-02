import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../server.js';
import { createInMemoryRepositories } from '../../test-support/in-memory.js';
import { InMemoryRateLimiter } from '../fraud/rate-limiter.js';
import type { SsvVerifier } from './ssv-verifier.js';

const allowVerifier: SsvVerifier = { verify: async () => true };
const denyVerifier: SsvVerifier = { verify: async () => false };

async function setup(verifier: SsvVerifier): Promise<{ app: FastifyInstance; deviceId: string }> {
  const app = await buildServer({
    repositories: createInMemoryRepositories(),
    ssvVerifier: verifier,
    rateLimiter: new InMemoryRateLimiter(),
  });
  await app.ready();
  const reg = await app.inject({
    method: 'POST',
    url: '/api/device/register',
    payload: { installId: 'i1', appVersion: '0.0.1', platform: 'android', language: 'ru' },
  });
  return { app, deviceId: reg.json().deviceId as string };
}

async function startSession(app: FastifyInstance, deviceId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/ads/session/start',
    headers: { 'x-device-id': deviceId },
  });
  return res.json().sessionId as string;
}

function ssvUrl(sessionId: string, txn: string): string {
  return `/api/rewards/admob/ssv?ad_network=admob&reward_amount=1&transaction_id=${txn}&custom_data=${sessionId}&signature=AAAA&key_id=1`;
}

async function balance(app: FastifyInstance, deviceId: string): Promise<number> {
  const res = await app.inject({
    method: 'GET',
    url: '/api/rewards/balance',
    headers: { 'x-device-id': deviceId },
  });
  return res.json().balanceMinutes as number;
}

describe('Ads / rewards SSV flow', () => {
  it('grants minutes on a verified SSV callback', async () => {
    const { app, deviceId } = await setup(allowVerifier);
    const sessionId = await startSession(app, deviceId);
    const res = await app.inject({ method: 'GET', url: ssvUrl(sessionId, 'txn-1') });
    expect(res.statusCode).toBe(200);
    expect(res.json().granted).toBe(true);
    expect(await balance(app, deviceId)).toBe(30);
    await app.close();
  });

  it('does not double-credit a duplicate transaction_id', async () => {
    const { app, deviceId } = await setup(allowVerifier);
    const sessionId = await startSession(app, deviceId);
    await app.inject({ method: 'GET', url: ssvUrl(sessionId, 'txn-dup') });
    const second = await app.inject({ method: 'GET', url: ssvUrl(sessionId, 'txn-dup') });
    expect(second.statusCode).toBe(200);
    expect(second.json().granted).toBe(false);
    expect(await balance(app, deviceId)).toBe(30);
    await app.close();
  });

  it('rejects an invalid signature without crediting (403)', async () => {
    const { app, deviceId } = await setup(denyVerifier);
    const sessionId = await startSession(app, deviceId);
    const res = await app.inject({ method: 'GET', url: ssvUrl(sessionId, 'txn-x') });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(await balance(app, deviceId)).toBe(0);
    await app.close();
  });

  it('returns 404 for an unknown ad session', async () => {
    const { app } = await setup(allowVerifier);
    const res = await app.inject({ method: 'GET', url: ssvUrl('no-such-session', 'txn-y') });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('POST /api/ads/no-fill-report grants emergency access when eligible', async () => {
    const { app, deviceId } = await setup(allowVerifier);
    const res = await app.inject({
      method: 'POST',
      url: '/api/ads/no-fill-report',
      headers: { 'x-device-id': deviceId },
      payload: { failedNetworksCount: 10 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().granted).toBe(true);
    expect(res.json().minutes).toBe(15);
    expect(await balance(app, deviceId)).toBe(15);
    await app.close();
  });

  it('POST /api/ads/no-fill-report denies when too few networks failed', async () => {
    const { app, deviceId } = await setup(allowVerifier);
    const res = await app.inject({
      method: 'POST',
      url: '/api/ads/no-fill-report',
      headers: { 'x-device-id': deviceId },
      payload: { failedNetworksCount: 2 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().granted).toBe(false);
    expect(res.json().reason).toBe('insufficient_failures');
    await app.close();
  });

  it('GET /api/ads/config exposes the rewarded unit and minutes', async () => {
    const { app } = await setup(allowVerifier);
    const res = await app.inject({ method: 'GET', url: '/api/ads/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json().provider).toBe('admob');
    expect(res.json().rewardMinutes).toBe(30);
    await app.close();
  });
});
