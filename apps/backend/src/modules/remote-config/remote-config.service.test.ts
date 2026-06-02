import { describe, expect, it } from 'vitest';
import { InMemoryRemoteConfigRepository } from './remote-config.repository.js';
import { DEFAULT_APP_CONFIG, RemoteConfigService } from './remote-config.service.js';

describe('RemoteConfigService.getAppConfig', () => {
  it('returns defaults when no overrides exist', async () => {
    const service = new RemoteConfigService(new InMemoryRemoteConfigRepository());
    expect(await service.getAppConfig()).toEqual(DEFAULT_APP_CONFIG);
  });

  it('overlays overrides and coerces by type', async () => {
    const service = new RemoteConfigService(
      new InMemoryRemoteConfigRepository([
        { key: 'reward_minutes_per_ad', value: '45', valueType: 'number' },
        { key: 'maintenance_mode', value: 'true', valueType: 'boolean' },
        { key: 'min_app_version', value: '1.2.3', valueType: 'string' },
        { key: 'feature_flags', value: '{"newHome":true,"legacy":0}', valueType: 'json' },
      ]),
    );
    const cfg = await service.getAppConfig();
    expect(cfg.rewardMinutesPerAd).toBe(45);
    expect(cfg.maintenanceMode).toBe(true);
    expect(cfg.minAppVersion).toBe('1.2.3');
    expect(cfg.featureFlags).toEqual({ newHome: true, legacy: false });
  });

  it('falls back to defaults for malformed values', async () => {
    const service = new RemoteConfigService(
      new InMemoryRemoteConfigRepository([
        { key: 'reward_minutes_per_ad', value: 'not-a-number', valueType: 'number' },
        { key: 'feature_flags', value: 'not json', valueType: 'json' },
      ]),
    );
    const cfg = await service.getAppConfig();
    expect(cfg.rewardMinutesPerAd).toBe(DEFAULT_APP_CONFIG.rewardMinutesPerAd);
    expect(cfg.featureFlags).toEqual({});
  });

  it('rejects non-integer and negative numeric overrides (would truncate at serialization)', async () => {
    const service = new RemoteConfigService(
      new InMemoryRemoteConfigRepository([
        { key: 'reward_minutes_per_ad', value: '30.5', valueType: 'number' },
        { key: 'emergency_minutes', value: '-5', valueType: 'number' },
      ]),
    );
    const cfg = await service.getAppConfig();
    expect(cfg.rewardMinutesPerAd).toBe(DEFAULT_APP_CONFIG.rewardMinutesPerAd);
    expect(cfg.emergencyMinutes).toBe(DEFAULT_APP_CONFIG.emergencyMinutes);
  });
});
