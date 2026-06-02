import { beforeEach, describe, expect, it } from 'vitest';
import type { DeviceRegisterRequest } from '@vpn/types';
import { DeviceBlockedError, NotFoundError } from '../../lib/errors.js';
import { InMemoryLedgerRepository } from '../ledger/ledger.repository.js';
import {
  DuplicateInstallIdError,
  InMemoryDeviceRepository,
  type DeviceRepository,
  type DeviceRow,
} from './device.repository.js';
import { DeviceService } from './device.service.js';

const baseReq: DeviceRegisterRequest = {
  installId: 'install-1',
  appVersion: '0.0.1',
  platform: 'android',
  language: 'ru',
};

describe('DeviceService.register', () => {
  let devices: InMemoryDeviceRepository;
  let ledger: InMemoryLedgerRepository;
  let service: DeviceService;

  beforeEach(() => {
    devices = new InMemoryDeviceRepository();
    ledger = new InMemoryLedgerRepository();
    service = new DeviceService(devices, ledger);
  });

  it('creates a new device with a uuid and zero balance', async () => {
    const res = await service.register(baseReq);
    expect(res.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.balanceMinutes).toBe(0);
    expect(res.isBlocked).toBe(false);
    expect(res.language).toBe('ru');
  });

  it('is idempotent by installId and updates the app version on re-register', async () => {
    const first = await service.register(baseReq);
    const second = await service.register({ ...baseReq, appVersion: '0.0.2' });
    expect(second.deviceId).toBe(first.deviceId);
    const stored = await devices.findById(first.deviceId);
    expect(stored?.appVersion).toBe('0.0.2');
  });

  it('reuses an explicitly provided deviceId even with a new installId', async () => {
    const first = await service.register(baseReq);
    const again = await service.register({
      ...baseReq,
      installId: 'install-2',
      deviceId: first.deviceId,
    });
    expect(again.deviceId).toBe(first.deviceId);
  });

  it('reports the signed ledger sum as balance', async () => {
    const dev = await service.register(baseReq);
    ledger.add(dev.deviceId, 30);
    ledger.add(dev.deviceId, -5);
    const bal = await service.getBalance(dev.deviceId);
    expect(bal.balanceMinutes).toBe(25);
  });
});

describe('DeviceService errors', () => {
  it('throws NotFound on heartbeat for an unknown device', async () => {
    const service = new DeviceService(
      new InMemoryDeviceRepository(),
      new InMemoryLedgerRepository(),
    );
    await expect(service.heartbeat('missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws DeviceBlocked for a blocked device', async () => {
    const devices = new InMemoryDeviceRepository();
    const service = new DeviceService(devices, new InMemoryLedgerRepository());
    const dev = await service.register(baseReq);
    const row = await devices.findById(dev.deviceId);
    if (row) row.isBlocked = true;
    await expect(service.getBalance(dev.deviceId)).rejects.toBeInstanceOf(DeviceBlockedError);
  });

  it('rejects register for an existing blocked device (consistent with heartbeat)', async () => {
    const devices = new InMemoryDeviceRepository();
    const service = new DeviceService(devices, new InMemoryLedgerRepository());
    const dev = await service.register(baseReq);
    const row = await devices.findById(dev.deviceId);
    if (row) row.isBlocked = true;
    await expect(service.register(baseReq)).rejects.toBeInstanceOf(DeviceBlockedError);
  });

  it('stays idempotent when a concurrent create loses the install_id race', async () => {
    // Models the race: the first install_id lookup misses (stale read), create
    // hits the unique constraint, and the retry must reuse the winner's row.
    const winner: DeviceRow = {
      id: 'winner-uuid',
      installId: 'install-race',
      appVersion: '0.0.1',
      platform: 'android',
      language: 'ru',
      country: null,
      timezone: null,
      deviceIntegrityStatus: null,
      fraudScore: 0,
      isBlocked: false,
      balanceMinutesCache: 0,
      createdAt: new Date(),
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    };
    let installLookups = 0;
    const racy: DeviceRepository = {
      findById: async () => null,
      findByInstallId: async () => (installLookups++ === 0 ? null : winner),
      create: async () => {
        throw new DuplicateInstallIdError();
      },
      touch: async () => {},
      list: async () => [],
      count: async () => 0,
      countBlocked: async () => 0,
      setBlocked: async () => {},
      addFraudScore: async () => 0,
    };
    const service = new DeviceService(racy, new InMemoryLedgerRepository());
    const res = await service.register({
      installId: 'install-race',
      appVersion: '0.0.1',
      platform: 'android',
      language: 'ru',
    });
    expect(res.deviceId).toBe('winner-uuid');
  });
});
