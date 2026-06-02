import type {
  AuditLogEntry,
  DashboardStats,
  DeviceDetail,
  DeviceListItem,
  EconomyOverview,
  EmergencyLogEntry,
  Language,
  LedgerEntryView,
  Paginated,
  RemoteConfigItem,
  RemoteConfigSetRequest,
} from '@vpn/types';
import { NotFoundError } from '../../lib/errors.js';
import type { AdSessionRepository } from '../ads/ad-session.repository.js';
import type { DeviceRepository, DeviceRow } from '../device/device.repository.js';
import type { EmergencyLogRepository } from '../emergency/emergency-log.repository.js';
import type { LedgerEntryRecord, LedgerRepository } from '../ledger/ledger.repository.js';
import type { RemoteConfigRepository } from '../remote-config/remote-config.repository.js';
import type { AuditLogRepository } from './admin.repository.js';

function toDeviceListItem(d: DeviceRow): DeviceListItem {
  return {
    deviceId: d.id,
    language: d.language as Language,
    country: d.country,
    appVersion: d.appVersion,
    isBlocked: d.isBlocked,
    fraudScore: d.fraudScore,
    createdAt: d.createdAt.toISOString(),
    lastSeenAt: d.lastSeenAt.toISOString(),
  };
}

function toLedgerView(e: LedgerEntryRecord): LedgerEntryView {
  return {
    entryType: e.entryType,
    minutes: e.minutes,
    referenceId: e.referenceId,
    createdAt: e.createdAt.toISOString(),
  };
}

export class AdminService {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly ledger: LedgerRepository,
    private readonly adSessions: AdSessionRepository,
    private readonly audit: AuditLogRepository,
    private readonly remoteConfig: RemoteConfigRepository,
    private readonly emergencyLogs: EmergencyLogRepository,
  ) {}

  async emergencyLogsList(limit = 100): Promise<EmergencyLogEntry[]> {
    return this.emergencyLogs.listRecent(limit);
  }

  async dashboard(): Promise<DashboardStats> {
    const [totalDevices, blockedDevices, rewardMinutesGranted, adSessions] = await Promise.all([
      this.devices.count(),
      this.devices.countBlocked(),
      this.ledger.sumByType('reward_ad'),
      this.adSessions.count(),
    ]);
    return { totalDevices, blockedDevices, rewardMinutesGranted, adSessions };
  }

  async listDevices(page: number, pageSize: number): Promise<Paginated<DeviceListItem>> {
    const offset = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      this.devices.list({ limit: pageSize, offset }),
      this.devices.count(),
    ]);
    return { items: rows.map(toDeviceListItem), total, page, pageSize };
  }

  async getDevice(deviceId: string): Promise<DeviceDetail> {
    const device = await this.devices.findById(deviceId);
    if (!device) throw new NotFoundError('Device not found');
    const [balanceMinutes, ledger] = await Promise.all([
      this.ledger.getBalance(deviceId),
      this.ledger.listByDevice(deviceId, 20),
    ]);
    return { ...toDeviceListItem(device), balanceMinutes, recentLedger: ledger.map(toLedgerView) };
  }

  async setDeviceBlocked(adminId: number, deviceId: string, blocked: boolean): Promise<void> {
    const device = await this.devices.findById(deviceId);
    if (!device) throw new NotFoundError('Device not found');
    await this.devices.setBlocked(deviceId, blocked);
    await this.audit.record({
      adminId,
      action: blocked ? 'device.block' : 'device.unblock',
      targetType: 'device',
      targetId: deviceId,
    });
  }

  async auditLogs(limit = 50): Promise<AuditLogEntry[]> {
    return this.audit.list(limit);
  }

  async listRemoteConfig(): Promise<RemoteConfigItem[]> {
    const rows = await this.remoteConfig.getAll();
    return rows
      .map((r) => ({ key: r.key, value: r.value, valueType: r.valueType }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  async setRemoteConfig(adminId: number, input: RemoteConfigSetRequest): Promise<void> {
    const valueType = input.valueType ?? 'string';
    await this.remoteConfig.upsert({
      key: input.key,
      value: input.value,
      valueType,
      updatedBy: String(adminId),
    });
    await this.audit.record({
      adminId,
      action: 'remote_config.set',
      targetType: 'remote_config',
      targetId: input.key,
    });
  }

  async economyOverview(): Promise<EconomyOverview> {
    const [totalDevices, rewardMinutesGranted, emergencyMinutesGranted, vpnUsage, adSessions] =
      await Promise.all([
        this.devices.count(),
        this.ledger.sumByType('reward_ad'),
        this.ledger.sumByType('emergency_free_access'),
        this.ledger.sumByType('vpn_usage'),
        this.adSessions.count(),
      ]);
    return {
      totalDevices,
      rewardMinutesGranted,
      emergencyMinutesGranted,
      // vpn_usage entries are negative; report consumed minutes as a positive.
      vpnMinutesUsed: Math.abs(vpnUsage),
      adSessions,
    };
  }
}
