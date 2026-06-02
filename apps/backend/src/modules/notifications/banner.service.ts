import type { AdminBanner, AdminBannerCreate, BannerView } from '@vpn/types';
import { NotFoundError } from '../../lib/errors.js';
import type { DeviceRepository } from '../device/device.repository.js';
import type { LedgerRepository } from '../ledger/ledger.repository.js';
import type { AuditLogRepository } from '../admin/admin.repository.js';
import type { BannerRepository, InAppBannerRow } from './banner.repository.js';

function toView(b: InAppBannerRow): BannerView {
  return {
    id: b.id,
    title: b.title,
    body: b.body,
    imageUrl: b.imageUrl,
    deeplink: b.deeplink,
    priority: b.priority,
  };
}

function toAdmin(b: InAppBannerRow): AdminBanner {
  return {
    ...toView(b),
    language: b.language,
    segment: b.segment,
    startsAt: b.startsAt ? b.startsAt.toISOString() : null,
    endsAt: b.endsAt ? b.endsAt.toISOString() : null,
    enabled: b.enabled,
    createdAt: b.createdAt.toISOString(),
  };
}

function segmentMatches(segment: string, balanceMinutes: number): boolean {
  if (segment === 'zero_balance') return balanceMinutes <= 0;
  if (segment === 'has_balance') return balanceMinutes > 0;
  return true; // 'all' / unknown → everyone
}

export class BannerService {
  constructor(
    private readonly banners: BannerRepository,
    private readonly devices: DeviceRepository,
    private readonly ledger: LedgerRepository,
    private readonly audit: AuditLogRepository,
  ) {}

  /** Active banners for a device, filtered by language / date window / segment. */
  async activeForDevice(deviceId: string): Promise<BannerView[]> {
    const device = await this.devices.findById(deviceId);
    if (!device) throw new NotFoundError('Device not found');
    const balance = await this.ledger.getBalance(deviceId);
    const now = Date.now();

    return (await this.banners.listAll())
      .filter((b) => b.enabled)
      .filter((b) => b.startsAt === null || b.startsAt.getTime() <= now)
      .filter((b) => b.endsAt === null || b.endsAt.getTime() >= now)
      .filter((b) => b.language === null || b.language === device.language)
      .filter((b) => segmentMatches(b.segment, balance))
      .sort((a, b) => b.priority - a.priority)
      .map(toView);
  }

  // --- admin ------------------------------------------------------------

  async list(): Promise<AdminBanner[]> {
    return (await this.banners.listAll()).map(toAdmin);
  }

  async create(adminId: number, input: AdminBannerCreate): Promise<AdminBanner> {
    const banner = await this.banners.create({
      title: input.title,
      body: input.body,
      imageUrl: input.imageUrl ?? null,
      deeplink: input.deeplink ?? null,
      language: input.language ?? null,
      segment: input.segment ?? 'all',
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      priority: input.priority ?? 0,
    });
    await this.audit.record({
      adminId,
      action: 'banner.create',
      targetType: 'banner',
      targetId: String(banner.id),
    });
    return toAdmin(banner);
  }

  async toggle(adminId: number, id: number, enabled: boolean): Promise<void> {
    const banner = await this.banners.findById(id);
    if (!banner) throw new NotFoundError('Banner not found');
    await this.banners.setEnabled(id, enabled);
    await this.audit.record({
      adminId,
      action: enabled ? 'banner.enable' : 'banner.disable',
      targetType: 'banner',
      targetId: String(id),
    });
  }

  async remove(adminId: number, id: number): Promise<void> {
    const banner = await this.banners.findById(id);
    if (!banner) throw new NotFoundError('Banner not found');
    await this.banners.delete(id);
    await this.audit.record({
      adminId,
      action: 'banner.delete',
      targetType: 'banner',
      targetId: String(id),
    });
  }
}
