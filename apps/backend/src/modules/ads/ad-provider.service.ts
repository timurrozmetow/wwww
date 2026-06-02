import type {
  AdminAdProvider,
  AdminAdProviderUpdate,
  AdProviderWaterfallItem,
  AdWaterfallConfig,
} from '@vpn/types';
import { NotFoundError } from '../../lib/errors.js';
import type { AuditLogRepository } from '../admin/admin.repository.js';
import type { AdProviderRepository, AdProviderRow } from './ad-provider.repository.js';

/** Client view — order + ad units only. eCPM / fill never leave the backend. */
function toWaterfallItem(p: AdProviderRow): AdProviderWaterfallItem {
  return {
    key: p.key,
    name: p.name,
    adUnitId: p.adUnitId,
    timeoutMs: p.timeoutMs,
    priority: p.priority,
  };
}

function toAdmin(p: AdProviderRow): AdminAdProvider {
  return {
    id: p.id,
    key: p.key,
    name: p.name,
    priority: p.priority,
    ecpmEstimate: p.ecpmEstimate,
    fillRate: p.fillRate,
    adUnitId: p.adUnitId,
    timeoutMs: p.timeoutMs,
    enabled: p.enabled,
  };
}

export class AdProviderService {
  constructor(
    private readonly providers: AdProviderRepository,
    private readonly audit: AuditLogRepository,
  ) {}

  /** Enabled providers in waterfall order — served to the client, no economics. */
  async getWaterfall(): Promise<AdWaterfallConfig> {
    const rows = await this.providers.listAll();
    return {
      providers: rows
        .filter((p) => p.enabled)
        .sort((a, b) => a.priority - b.priority)
        .map(toWaterfallItem),
    };
  }

  // --- admin ------------------------------------------------------------

  async list(): Promise<AdminAdProvider[]> {
    return (await this.providers.listAll()).map(toAdmin);
  }

  async update(
    adminId: number,
    id: number,
    patch: AdminAdProviderUpdate,
  ): Promise<AdminAdProvider> {
    const existing = await this.providers.findById(id);
    if (!existing) throw new NotFoundError('Ad provider not found');
    await this.providers.update(id, patch);
    const updated = await this.providers.findById(id);
    if (!updated) throw new NotFoundError('Ad provider not found');
    await this.audit.record({
      adminId,
      action: 'ad_provider.update',
      targetType: 'ad_provider',
      targetId: String(id),
      metadata: patch,
    });
    return toAdmin(updated);
  }

  async toggle(adminId: number, id: number, enabled: boolean): Promise<void> {
    const existing = await this.providers.findById(id);
    if (!existing) throw new NotFoundError('Ad provider not found');
    await this.providers.update(id, { enabled });
    await this.audit.record({
      adminId,
      action: enabled ? 'ad_provider.enable' : 'ad_provider.disable',
      targetType: 'ad_provider',
      targetId: String(id),
    });
  }
}
