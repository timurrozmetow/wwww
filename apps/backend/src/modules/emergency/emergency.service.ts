import type { EmergencyReason, EmergencyResult } from '@vpn/types';
import { NotFoundError } from '../../lib/errors.js';
import { configInt } from '../../lib/config-num.js';
import type { DeviceRepository } from '../device/device.repository.js';
import type { LedgerRepository } from '../ledger/ledger.repository.js';
import type { RemoteConfigRepository } from '../remote-config/remote-config.repository.js';
import type { EmergencyLogRepository } from './emergency-log.repository.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

interface EmergencyConfig {
  enabled: boolean;
  minutes: number;
  onlyIfBalanceZero: boolean;
  cooldownHours: number;
  maxPerDay: number;
  maxPerWeek: number;
  requireAllNetworksFailed: boolean;
  minFailedNetworksCount: number;
  fraudScoreMax: number;
}

/**
 * Emergency free access (CLAUDE.md §7.7). Granted ONLY when all ad networks
 * failed and the balance is zero, subject to cooldown / per-day / per-week
 * limits and fraud checks — every decision is logged. The ledger reference is a
 * time-bucketed key so concurrent double-submits can't double-credit.
 */
export class EmergencyService {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly ledger: LedgerRepository,
    private readonly logs: EmergencyLogRepository,
    private readonly remoteConfig: RemoteConfigRepository,
  ) {}

  async requestEmergency(deviceId: string, failedNetworksCount: number): Promise<EmergencyResult> {
    const device = await this.devices.findById(deviceId);
    if (!device) throw new NotFoundError('Device not found');

    const cfg = await this.loadConfig();
    const balance = await this.ledger.getBalance(deviceId);

    const deny = async (reason: EmergencyReason): Promise<EmergencyResult> => {
      await this.logs.record({
        deviceId,
        granted: false,
        minutes: 0,
        reason,
        failedNetworks: failedNetworksCount,
      });
      return { granted: false, minutes: 0, balanceMinutes: balance, reason };
    };

    if (!cfg.enabled) return deny('disabled');
    if (device.isBlocked) return deny('blocked');
    if (device.fraudScore > cfg.fraudScoreMax) return deny('fraud');
    if (cfg.onlyIfBalanceZero && balance > 0) return deny('has_balance');
    if (cfg.requireAllNetworksFailed && failedNetworksCount < cfg.minFailedNetworksCount) {
      return deny('insufficient_failures');
    }

    const now = Date.now();
    const cooldownMs = cfg.cooldownHours * 60 * 60 * 1000;
    if (
      cooldownMs > 0 &&
      (await this.logs.countGrantedSince(deviceId, new Date(now - cooldownMs))) > 0
    ) {
      return deny('cooldown');
    }
    const grantsToday = await this.logs.countGrantedSince(deviceId, new Date(now - DAY_MS));
    if (grantsToday >= cfg.maxPerDay) return deny('daily_limit');
    if ((await this.logs.countGrantedSince(deviceId, new Date(now - WEEK_MS))) >= cfg.maxPerWeek) {
      return deny('weekly_limit');
    }

    // The reference is keyed by the GRANT SLOT (the count) within a day namespace,
    // NOT a time window: concurrent requests that read the same count produce the
    // SAME reference and collide on the ledger unique index, so the DB — not a
    // racy read-before-write count — caps grants at the configured quota (§7.7).
    const dayBucket = Math.floor(now / DAY_MS);
    const { created } = await this.ledger.append({
      deviceId,
      entryType: 'emergency_free_access',
      minutes: cfg.minutes,
      referenceId: `emergency:${deviceId}:${dayBucket}:${grantsToday}`,
      metadata: { failedNetworks: failedNetworksCount },
    });

    if (!created) {
      // Lost the concurrent race for this slot — a sibling already granted +N.
      // The credit exists: report success with a fresh balance; log a dedupe
      // marker (granted:false so it doesn't inflate the quota count).
      await this.logs.record({
        deviceId,
        granted: false,
        minutes: 0,
        reason: 'duplicate',
        failedNetworks: failedNetworksCount,
      });
      return {
        granted: true,
        minutes: cfg.minutes,
        balanceMinutes: await this.ledger.getBalance(deviceId),
        reason: 'granted',
      };
    }

    await this.logs.record({
      deviceId,
      granted: true,
      minutes: cfg.minutes,
      reason: 'granted',
      failedNetworks: failedNetworksCount,
    });
    return {
      granted: true,
      minutes: cfg.minutes,
      balanceMinutes: await this.ledger.getBalance(deviceId),
      reason: 'granted',
    };
  }

  private async loadConfig(): Promise<EmergencyConfig> {
    const rows = await this.remoteConfig.getAll();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    // Strict non-negative integers (rejects '', '1e9', decimals) so a
    // fat-fingered/compromised row can't flip a grant into a debit or silently
    // widen a quota / disable the fraud gate (§7.5/§8, review C2/M2).
    const num = (key: string, fallback: number): number => configInt(map.get(key), fallback);
    const bool = (key: string, fallback: boolean): boolean => {
      const raw = map.get(key);
      if (raw === undefined) return fallback;
      return raw === 'true' || raw === '1';
    };
    return {
      enabled: bool('emergency_access_enabled', true),
      minutes: num('emergency_minutes', 15),
      onlyIfBalanceZero: bool('only_if_balance_zero', true),
      cooldownHours: num('cooldown_hours', 12),
      maxPerDay: num('max_emergency_per_day', 1),
      maxPerWeek: num('max_emergency_per_week', 3),
      requireAllNetworksFailed: bool('require_all_networks_failed', true),
      minFailedNetworksCount: num('min_failed_networks_count', 10),
      // Cap matches FraudService so the shared key behaves identically in both gates.
      fraudScoreMax: configInt(map.get('fraud_score_max'), 50, { max: 1000 }),
    };
  }
}
