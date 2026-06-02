import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../lib/errors.js';
import { InMemoryDeviceRepository, type DeviceRow } from '../device/device.repository.js';
import { InMemoryLedgerRepository } from '../ledger/ledger.repository.js';
import {
  InMemoryRemoteConfigRepository,
  type RemoteConfigEntry,
} from '../remote-config/remote-config.repository.js';
import { InMemoryEmergencyLogRepository } from './emergency-log.repository.js';
import { EmergencyService } from './emergency.service.js';

function makeService(config: RemoteConfigEntry[] = []) {
  const devices = new InMemoryDeviceRepository();
  const ledger = new InMemoryLedgerRepository();
  const logs = new InMemoryEmergencyLogRepository();
  const remoteConfig = new InMemoryRemoteConfigRepository(config);
  const service = new EmergencyService(devices, ledger, logs, remoteConfig);
  return { service, devices, ledger, logs };
}

async function seedDevice(devices: InMemoryDeviceRepository): Promise<DeviceRow> {
  return devices.create({
    id: 'd1',
    installId: 'i1',
    appVersion: '0.0.1',
    platform: 'android',
    language: 'ru',
  });
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('EmergencyService.requestEmergency', () => {
  it('grants +15 when balance is 0 and all networks failed', async () => {
    const { service, devices, ledger } = makeService();
    await seedDevice(devices);
    const r = await service.requestEmergency('d1', 10);
    expect(r.granted).toBe(true);
    expect(r.minutes).toBe(15);
    expect(r.reason).toBe('granted');
    expect(await ledger.getBalance('d1')).toBe(15);
  });

  it('throws NotFound for an unknown device', async () => {
    const { service } = makeService();
    await expect(service.requestEmergency('nope', 10)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('denies when disabled', async () => {
    const { service, devices } = makeService([
      { key: 'emergency_access_enabled', value: 'false', valueType: 'boolean' },
    ]);
    await seedDevice(devices);
    expect((await service.requestEmergency('d1', 10)).reason).toBe('disabled');
  });

  it('denies a blocked device', async () => {
    const { service, devices } = makeService();
    const d = await seedDevice(devices);
    d.isBlocked = true;
    expect((await service.requestEmergency('d1', 10)).reason).toBe('blocked');
  });

  it('denies a high fraud score', async () => {
    const { service, devices } = makeService();
    const d = await seedDevice(devices);
    d.fraudScore = 99;
    expect((await service.requestEmergency('d1', 10)).reason).toBe('fraud');
  });

  it('denies when the device still has balance', async () => {
    const { service, devices, ledger } = makeService();
    await seedDevice(devices);
    ledger.add('d1', 30);
    expect((await service.requestEmergency('d1', 10)).reason).toBe('has_balance');
  });

  it('denies when not enough networks failed', async () => {
    const { service, devices } = makeService();
    await seedDevice(devices);
    expect((await service.requestEmergency('d1', 3)).reason).toBe('insufficient_failures');
  });

  it('denies during the cooldown window', async () => {
    const { service, devices, logs } = makeService();
    await seedDevice(devices);
    await logs.record({
      deviceId: 'd1',
      granted: true,
      minutes: 15,
      reason: 'granted',
      failedNetworks: 10,
    });
    logs.backdateLast(1 * HOUR); // within the default 12h cooldown
    expect((await service.requestEmergency('d1', 10)).reason).toBe('cooldown');
  });

  it('enforces the daily limit', async () => {
    const { service, devices, logs } = makeService([
      { key: 'cooldown_hours', value: '0', valueType: 'number' },
    ]);
    await seedDevice(devices);
    await logs.record({
      deviceId: 'd1',
      granted: true,
      minutes: 15,
      reason: 'granted',
      failedNetworks: 10,
    });
    logs.backdateLast(2 * HOUR); // earlier today, cooldown disabled
    expect((await service.requestEmergency('d1', 10)).reason).toBe('daily_limit');
  });

  it('enforces the weekly limit', async () => {
    const { service, devices, logs } = makeService([
      { key: 'max_emergency_per_week', value: '2', valueType: 'number' },
    ]);
    await seedDevice(devices);
    for (const daysAgo of [2, 4]) {
      await logs.record({
        deviceId: 'd1',
        granted: true,
        minutes: 15,
        reason: 'granted',
        failedNetworks: 10,
      });
      logs.backdateLast(daysAgo * DAY); // outside cooldown + outside 24h, inside the week
    }
    expect((await service.requestEmergency('d1', 10)).reason).toBe('weekly_limit');
  });

  it('is idempotent under concurrent requests (single +15, both report success)', async () => {
    const { service, devices, ledger } = makeService();
    await seedDevice(devices);
    const [a, b] = await Promise.all([
      service.requestEmergency('d1', 10),
      service.requestEmergency('d1', 10),
    ]);
    expect(await ledger.getBalance('d1')).toBe(15); // single credit despite concurrency
    expect(a.granted && b.granted).toBe(true); // the credit exists; both report it
  });

  it('caps a concurrent burst to the configured quota (no over-credit)', async () => {
    const { service, devices, ledger } = makeService(); // default max_emergency_per_day = 1
    await seedDevice(devices);
    await Promise.all(Array.from({ length: 6 }, () => service.requestEmergency('d1', 10)));
    expect(await ledger.getBalance('d1')).toBe(15);
  });

  it('allows up to maxPerDay sequential grants, then denies', async () => {
    const { service, devices, ledger } = makeService([
      { key: 'cooldown_hours', value: '0', valueType: 'number' },
      { key: 'max_emergency_per_day', value: '2', valueType: 'number' },
      // Disable the balance gate so the limit mechanism (not has_balance) is tested.
      { key: 'only_if_balance_zero', value: 'false', valueType: 'boolean' },
    ]);
    await seedDevice(devices);
    expect((await service.requestEmergency('d1', 10)).granted).toBe(true);
    expect((await service.requestEmergency('d1', 10)).granted).toBe(true);
    const third = await service.requestEmergency('d1', 10);
    expect(third.granted).toBe(false);
    expect(third.reason).toBe('daily_limit');
    expect(await ledger.getBalance('d1')).toBe(30);
  });

  it('ignores a negative emergency_minutes config — never debits', async () => {
    const { service, devices, ledger } = makeService([
      { key: 'emergency_minutes', value: '-15', valueType: 'number' },
    ]);
    await seedDevice(devices);
    const r = await service.requestEmergency('d1', 10);
    expect(r.granted).toBe(true);
    expect(r.minutes).toBe(15); // falls back to the default, never -15
    expect(await ledger.getBalance('d1')).toBe(15);
  });
});
