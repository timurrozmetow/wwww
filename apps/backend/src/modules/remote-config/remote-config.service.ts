import type { AppConfig } from '@vpn/types';
import { configInt } from '../../lib/config-num.js';
import type { RemoteConfigEntry, RemoteConfigRepository } from './remote-config.repository.js';

/**
 * Default business config (CLAUDE.md §8: no magic numbers — defaults here,
 * overridable per row in `remote_config`). 1 ad = 30 min, accrue up to 1 year.
 */
export const DEFAULT_APP_CONFIG: AppConfig = {
  rewardMinutesPerAd: 30,
  emergencyMinutes: 15,
  maxBalanceDays: 365,
  maintenanceMode: false,
  forceUpdate: false,
  minAppVersion: '0.0.1',
  splitTunnelingEnabled: false,
  featureFlags: {},
};

function parseFlags(raw: string | undefined): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        out[k] = Boolean(v);
      }
      return out;
    }
  } catch {
    // ignore malformed JSON — fall back to no flags
  }
  return {};
}

export class RemoteConfigService {
  constructor(private readonly repo: RemoteConfigRepository) {}

  async getAppConfig(): Promise<AppConfig> {
    const rows = await this.repo.getAll();
    const map = new Map<string, RemoteConfigEntry>(rows.map((r) => [r.key, r]));

    // These business numbers are non-negative integers; reject anything else so
    // a fat-fingered admin row can't silently truncate or, via an empty string,
    // coerce to 0 (§8, review M2). configInt treats blank/junk as 'use fallback'.
    const intNonNeg = (key: string, fallback: number): number =>
      configInt(map.get(key)?.value, fallback);
    const bool = (key: string, fallback: boolean): boolean => {
      const raw = map.get(key)?.value;
      if (raw === undefined) return fallback;
      return raw === 'true' || raw === '1';
    };
    const str = (key: string, fallback: string): string => map.get(key)?.value ?? fallback;

    return {
      rewardMinutesPerAd: intNonNeg('reward_minutes_per_ad', DEFAULT_APP_CONFIG.rewardMinutesPerAd),
      emergencyMinutes: intNonNeg('emergency_minutes', DEFAULT_APP_CONFIG.emergencyMinutes),
      maxBalanceDays: intNonNeg('max_balance_days', DEFAULT_APP_CONFIG.maxBalanceDays),
      maintenanceMode: bool('maintenance_mode', DEFAULT_APP_CONFIG.maintenanceMode),
      forceUpdate: bool('force_update', DEFAULT_APP_CONFIG.forceUpdate),
      minAppVersion: str('min_app_version', DEFAULT_APP_CONFIG.minAppVersion),
      splitTunnelingEnabled: bool(
        'split_tunneling_enabled',
        DEFAULT_APP_CONFIG.splitTunnelingEnabled,
      ),
      featureFlags: parseFlags(map.get('feature_flags')?.value),
    };
  }
}
