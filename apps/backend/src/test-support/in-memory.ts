import type { Repositories } from '../server.js';
import { InMemoryDeviceRepository } from '../modules/device/device.repository.js';
import { InMemoryLedgerRepository } from '../modules/ledger/ledger.repository.js';
import {
  InMemoryRemoteConfigRepository,
  type RemoteConfigEntry,
} from '../modules/remote-config/remote-config.repository.js';
import { InMemoryAdSessionRepository } from '../modules/ads/ad-session.repository.js';
import { InMemoryRewardTransactionRepository } from '../modules/ads/reward-transaction.repository.js';
import { InMemoryAdProviderRepository } from '../modules/ads/ad-provider.repository.js';
import { buildSeedAdProviders } from '../modules/ads/ad-provider.seed.js';
import {
  InMemoryAdminRepository,
  InMemoryAuditLogRepository,
} from '../modules/admin/admin.repository.js';
import { InMemoryVpnServerRepository } from '../modules/vpn/vpn-server.repository.js';
import { InMemoryVpnSessionRepository } from '../modules/vpn/vpn-session.repository.js';
import { InMemoryVpnProviderRepository } from '../modules/vpn/vpn-provider.repository.js';
import { InMemoryEmergencyLogRepository } from '../modules/emergency/emergency-log.repository.js';
import { InMemoryBannerRepository } from '../modules/notifications/banner.repository.js';
import { InMemoryPushTokenRepository } from '../modules/notifications/push-token.repository.js';
import { InMemoryPushCampaignRepository } from '../modules/notifications/push-campaign.repository.js';
import { InMemoryFraudEventRepository } from '../modules/fraud/fraud-event.repository.js';
import { buildSeedProviders, buildSeedServers } from '../modules/vpn/seed.js';

/** Concrete in-memory repositories (exposes test-only helpers like `ledger.add`). */
export interface InMemoryRepositories extends Repositories {
  devices: InMemoryDeviceRepository;
  ledger: InMemoryLedgerRepository;
  adSessions: InMemoryAdSessionRepository;
  adProviders: InMemoryAdProviderRepository;
  admins: InMemoryAdminRepository;
  auditLogs: InMemoryAuditLogRepository;
  vpnServers: InMemoryVpnServerRepository;
  vpnSessions: InMemoryVpnSessionRepository;
  vpnProviders: InMemoryVpnProviderRepository;
  emergencyLogs: InMemoryEmergencyLogRepository;
  banners: InMemoryBannerRepository;
  pushTokens: InMemoryPushTokenRepository;
  pushCampaigns: InMemoryPushCampaignRepository;
  fraudEvents: InMemoryFraudEventRepository;
}

export function createInMemoryRepositories(
  remoteConfig: RemoteConfigEntry[] = [],
): InMemoryRepositories {
  return {
    devices: new InMemoryDeviceRepository(),
    ledger: new InMemoryLedgerRepository(),
    remoteConfig: new InMemoryRemoteConfigRepository(remoteConfig),
    adSessions: new InMemoryAdSessionRepository(),
    rewardTransactions: new InMemoryRewardTransactionRepository(),
    adProviders: new InMemoryAdProviderRepository(buildSeedAdProviders()),
    admins: new InMemoryAdminRepository(),
    auditLogs: new InMemoryAuditLogRepository(),
    vpnServers: new InMemoryVpnServerRepository(buildSeedServers()),
    vpnSessions: new InMemoryVpnSessionRepository(),
    vpnProviders: new InMemoryVpnProviderRepository(buildSeedProviders()),
    emergencyLogs: new InMemoryEmergencyLogRepository(),
    banners: new InMemoryBannerRepository(),
    pushTokens: new InMemoryPushTokenRepository(),
    pushCampaigns: new InMemoryPushCampaignRepository(),
    fraudEvents: new InMemoryFraudEventRepository(),
  };
}
