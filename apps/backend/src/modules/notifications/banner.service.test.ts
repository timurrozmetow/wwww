import { describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../admin/admin.repository.js';
import { InMemoryDeviceRepository } from '../device/device.repository.js';
import { InMemoryLedgerRepository } from '../ledger/ledger.repository.js';
import { InMemoryBannerRepository } from './banner.repository.js';
import { BannerService } from './banner.service.js';

async function setup() {
  const banners = new InMemoryBannerRepository();
  const devices = new InMemoryDeviceRepository();
  const ledger = new InMemoryLedgerRepository();
  const service = new BannerService(banners, devices, ledger, new InMemoryAuditLogRepository());
  await devices.create({
    id: 'd1',
    installId: 'i1',
    appVersion: '0.0.1',
    platform: 'android',
    language: 'ru',
  });
  return { service, ledger };
}

describe('BannerService.activeForDevice', () => {
  it('filters by language (null = all languages)', async () => {
    const { service } = await setup();
    await service.create(1, { title: 'RU', body: 'b', language: 'ru' });
    await service.create(1, { title: 'TR', body: 'b', language: 'tr' });
    await service.create(1, { title: 'ALL', body: 'b' });
    const titles = (await service.activeForDevice('d1')).map((v) => v.title);
    expect(titles).toContain('RU');
    expect(titles).toContain('ALL');
    expect(titles).not.toContain('TR');
  });

  it('respects enabled + date window and sorts by priority', async () => {
    const { service } = await setup();
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    await service.create(1, {
      title: 'live',
      body: 'b',
      startsAt: past,
      endsAt: future,
      priority: 5,
    });
    await service.create(1, { title: 'expired', body: 'b', endsAt: past });
    await service.create(1, { title: 'future', body: 'b', startsAt: future });
    await service.create(1, { title: 'high', body: 'b', priority: 100 });
    const off = await service.create(1, { title: 'off', body: 'b' });
    await service.toggle(1, off.id, false);

    const titles = (await service.activeForDevice('d1')).map((v) => v.title);
    expect(titles).toContain('live');
    expect(titles).toContain('high');
    expect(titles).not.toContain('expired');
    expect(titles).not.toContain('future');
    expect(titles).not.toContain('off');
    expect(titles[0]).toBe('high'); // priority desc
  });

  it('filters by balance segment', async () => {
    const { service, ledger } = await setup();
    await service.create(1, { title: 'zero', body: 'b', segment: 'zero_balance' });
    await service.create(1, { title: 'has', body: 'b', segment: 'has_balance' });

    expect((await service.activeForDevice('d1')).map((v) => v.title)).toEqual(['zero']);
    ledger.add('d1', 30);
    expect((await service.activeForDevice('d1')).map((v) => v.title)).toEqual(['has']);
  });

  it('throws for an unknown device', async () => {
    const { service } = await setup();
    await expect(service.activeForDevice('missing')).rejects.toThrow();
  });
});
