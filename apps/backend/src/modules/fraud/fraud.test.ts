import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../server.js';
import {
  createInMemoryRepositories,
  type InMemoryRepositories,
} from '../../test-support/in-memory.js';
import type { RemoteConfigEntry } from '../remote-config/remote-config.repository.js';
import { AdminAuthService } from '../admin/admin-auth.service.js';
import { FraudService } from './fraud.service.js';
import { InMemoryRateLimiter, type RateLimiter } from './rate-limiter.js';
import { NoopIntegrityVerifier, type IntegrityVerifier } from './integrity-verifier.js';

function makeService(
  opts: {
    repos?: InMemoryRepositories;
    rateLimiter?: RateLimiter;
    integrity?: IntegrityVerifier;
    playIntegrityEnabled?: boolean;
  } = {},
): { repos: InMemoryRepositories; fraud: FraudService } {
  const repos = opts.repos ?? createInMemoryRepositories();
  const fraud = new FraudService(
    repos.devices,
    repos.fraudEvents,
    repos.remoteConfig,
    opts.rateLimiter ?? new InMemoryRateLimiter(),
    opts.integrity ?? new NoopIntegrityVerifier(),
    opts.playIntegrityEnabled ?? false,
  );
  return { repos, fraud };
}

async function addDevice(repos: InMemoryRepositories, id: string): Promise<void> {
  await repos.devices.create({
    id,
    installId: `inst-${id}`,
    appVersion: '1.0.0',
    platform: 'android',
    language: 'ru',
  });
}

// --- registration scoring ---------------------------------------------------

describe('FraudService.assessRegistration', () => {
  it('scores an emulator and records an event', async () => {
    const { repos, fraud } = makeService();
    await addDevice(repos, 'emu');
    await fraud.assessRegistration('emu', 'emulator');

    expect((await repos.devices.findById('emu'))?.fraudScore).toBe(30);
    const events = await repos.fraudEvents.listByDevice('emu', 10);
    expect(events.map((e) => e.eventType)).toEqual(['emulator_detected']);
  });

  it('leaves a genuine device untouched', async () => {
    const { repos, fraud } = makeService();
    await addDevice(repos, 'real');
    await fraud.assessRegistration('real', 'genuine');
    expect((await repos.devices.findById('real'))?.fraudScore).toBe(0);
    expect(await repos.fraudEvents.listByDevice('real', 10)).toHaveLength(0);
  });

  it('ignores integrity tokens when Play Integrity is disabled', async () => {
    const integrity: IntegrityVerifier = {
      verifyToken: async () => ({ valid: false, reason: 'should-not-run' }),
    };
    const { repos, fraud } = makeService({ integrity, playIntegrityEnabled: false });
    await addDevice(repos, 'd');
    await fraud.assessRegistration('d', 'genuine', 'some-token');
    expect((await repos.devices.findById('d'))?.fraudScore).toBe(0);
  });

  it('flags an invalid integrity token when enabled (fails closed on verify error)', async () => {
    const throwing: IntegrityVerifier = {
      verifyToken: async () => {
        throw new Error('verifier down');
      },
    };
    const { repos, fraud } = makeService({ integrity: throwing, playIntegrityEnabled: true });
    await addDevice(repos, 'd');
    await fraud.assessRegistration('d', 'genuine', 'bad-token');
    expect((await repos.devices.findById('d'))?.fraudScore).toBe(40);
    const events = await repos.fraudEvents.listByDevice('d', 10);
    expect(events.map((e) => e.eventType)).toEqual(['integrity_token_invalid']);
  });
});

// --- reward velocity / threshold gate ---------------------------------------

describe('FraudService.assessRewardGrant', () => {
  it('does not block or flag a normal reward cadence', async () => {
    const { repos, fraud } = makeService();
    await addDevice(repos, 'd');
    const a = await fraud.assessRewardGrant('d', 't1');
    expect(a.blocked).toBe(false);
    expect(a.score).toBe(0);
    expect(await repos.fraudEvents.listByDevice('d', 10)).toHaveLength(0);
  });

  it('hard-denies the over-cap burst in real time (review C1), not just scores it', async () => {
    // Default cap 6/window. Hits 1..6 granted; hit 7 is the over-cap breach.
    const { repos, fraud } = makeService();
    await addDevice(repos, 'd');
    for (let i = 1; i <= 6; i++) {
      expect((await fraud.assessRewardGrant('d', `t${i}`)).blocked).toBe(false);
    }
    expect((await fraud.assessRewardGrant('d', 't7')).blocked).toBe(true);
    expect((await repos.devices.findById('d'))?.fraudScore).toBe(15); // one velocity flag
    expect((await fraud.assessRewardGrant('d', 't8')).blocked).toBe(true);
    expect((await repos.devices.findById('d'))?.fraudScore).toBe(30); // and another
  });

  it('does not penalize AdMob SSV retries: a repeated transaction_id never re-counts (review M4)', async () => {
    const { repos, fraud } = makeService();
    await addDevice(repos, 'd');
    for (let i = 0; i < 20; i++) {
      expect((await fraud.assessRewardGrant('d', 'same-txn')).blocked).toBe(false);
    }
    expect((await repos.devices.findById('d'))?.fraudScore).toBe(0);
    expect(await repos.fraudEvents.countByTypeSince('d', 'reward_velocity', new Date(0))).toBe(0);
  });

  it('blocks a pre-flagged device on its first reward (hidden cooldown)', async () => {
    const { repos, fraud } = makeService();
    await addDevice(repos, 'd');
    await repos.devices.addFraudScore('d', 60); // already past the ceiling
    expect((await fraud.assessRewardGrant('d', 't1')).blocked).toBe(true);
  });

  it('respects a config override that lowers the cap', async () => {
    const cfg: RemoteConfigEntry[] = [
      { key: 'reward_velocity_max', value: '1', valueType: 'number' },
      { key: 'fraud_score_reward_velocity', value: '60', valueType: 'number' },
    ];
    const repos = createInMemoryRepositories(cfg);
    const { fraud } = makeService({ repos });
    await addDevice(repos, 'd');
    expect((await fraud.assessRewardGrant('d', 't1')).blocked).toBe(false); // count 1, within cap
    expect((await fraud.assessRewardGrant('d', 't2')).blocked).toBe(true); // count 2 > 1 → denied
    expect((await repos.devices.findById('d'))?.fraudScore).toBe(60);
  });
});

// --- config hardening (review C2 / M1 / M2) ---------------------------------

describe('FraudService config hardening', () => {
  it('rejects scientific notation in fraud_score_max so the gate is not disabled', async () => {
    const repos = createInMemoryRepositories([
      { key: 'fraud_score_max', value: '1e9', valueType: 'number' },
    ]);
    const { fraud } = makeService({ repos });
    await addDevice(repos, 'd');
    await repos.devices.addFraudScore('d', 60); // > default 50
    expect((await fraud.assessRewardGrant('d', 't1')).blocked).toBe(true);
  });

  it('clamps an absurdly large fraud_score_max so the gate still trips', async () => {
    const repos = createInMemoryRepositories([
      { key: 'fraud_score_max', value: '1000000000', valueType: 'number' },
    ]);
    const { fraud } = makeService({ repos });
    await addDevice(repos, 'd');
    await repos.devices.addFraudScore('d', 1500); // above the 1000 clamp
    expect((await fraud.assessRewardGrant('d', 't1')).blocked).toBe(true);
  });

  it('treats an empty severity as the default, not 0/disabled', async () => {
    const repos = createInMemoryRepositories([
      { key: 'fraud_score_emulator', value: '', valueType: 'number' },
    ]);
    const { fraud } = makeService({ repos });
    await addDevice(repos, 'd');
    await fraud.assessRegistration('d', 'emulator');
    expect((await repos.devices.findById('d'))?.fraudScore).toBe(30);
  });

  it('a zero velocity window does not disable the counter (floored, still caps)', async () => {
    const repos = createInMemoryRepositories([
      { key: 'reward_velocity_window_sec', value: '0', valueType: 'number' },
      { key: 'reward_velocity_max', value: '2', valueType: 'number' },
    ]);
    const { fraud } = makeService({ repos });
    await addDevice(repos, 'd');
    await fraud.assessRewardGrant('d', 't1');
    await fraud.assessRewardGrant('d', 't2');
    expect((await fraud.assessRewardGrant('d', 't3')).blocked).toBe(true); // count 3 > 2
  });
});

// --- re-scoring on re-register (review M5) ----------------------------------

describe('FraudService.assessRegistration re-scoring', () => {
  it('catches a device that turns rooted later, but dedupes repeated re-registers', async () => {
    const { repos, fraud } = makeService();
    await addDevice(repos, 'd');
    await fraud.assessRegistration('d', 'genuine'); // clean, no score
    expect((await repos.devices.findById('d'))?.fraudScore).toBe(0);

    await fraud.assessRegistration('d', 'rooted'); // now rooted → +40
    await fraud.assessRegistration('d', 'rooted'); // same window → deduped, no extra
    expect((await repos.devices.findById('d'))?.fraudScore).toBe(40);
    expect(await repos.fraudEvents.countByTypeSince('d', 'rooted_device', new Date(0))).toBe(1);
  });
});

// --- end-to-end: flagged device is silently denied a reward -----------------

describe('Anti-fraud reward gate (e2e)', () => {
  async function setup(): Promise<{
    app: FastifyInstance;
    repos: InMemoryRepositories;
    deviceId: string;
  }> {
    const repos = createInMemoryRepositories();
    const app = await buildServer({
      repositories: repos,
      ssvVerifier: { verify: async () => true },
      rateLimiter: new InMemoryRateLimiter(),
    });
    await app.ready();
    const reg = await app.inject({
      method: 'POST',
      url: '/api/device/register',
      payload: { installId: 'i1', appVersion: '0.0.1', platform: 'android', language: 'ru' },
    });
    return { app, repos, deviceId: reg.json().deviceId as string };
  }

  function ssvUrl(sessionId: string, txn: string): string {
    return `/api/rewards/admob/ssv?ad_network=admob&transaction_id=${txn}&custom_data=${sessionId}&signature=AAAA&key_id=1`;
  }

  it('silently denies a reward for a flagged device — 200 granted:false, no credit', async () => {
    const { app, repos, deviceId } = await setup();
    await repos.devices.addFraudScore(deviceId, 60); // over the ceiling

    const session = await app.inject({
      method: 'POST',
      url: '/api/ads/session/start',
      headers: { 'x-device-id': deviceId },
    });
    const sessionId = session.json().sessionId as string;

    const res = await app.inject({ method: 'GET', url: ssvUrl(sessionId, 'txn-1') });
    expect(res.statusCode).toBe(200);
    expect(res.json().granted).toBe(false);

    const balance = await app.inject({
      method: 'GET',
      url: '/api/rewards/balance',
      headers: { 'x-device-id': deviceId },
    });
    expect(balance.json().balanceMinutes).toBe(0);
    await app.close();
  });

  it('scores an emulator at register and surfaces it on the admin fraud log', async () => {
    const repos = createInMemoryRepositories();
    await new AdminAuthService(repos.admins).createAdmin('admin@test', 'secret123', 'admin');
    const app = await buildServer({ repositories: repos, rateLimiter: new InMemoryRateLimiter() });
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/api/device/register',
      payload: {
        installId: 'emu1',
        appVersion: '0.0.1',
        platform: 'android',
        language: 'ru',
        deviceIntegrityStatus: 'emulator',
      },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'admin@test', password: 'secret123' },
    });
    const headers = { authorization: `Bearer ${login.json().token as string}` };
    const events = await app.inject({ method: 'GET', url: '/api/admin/fraud/events', headers });
    expect(events.statusCode).toBe(200);
    expect(events.json().map((e: { eventType: string }) => e.eventType)).toContain(
      'emulator_detected',
    );
    await app.close();
  });
});
