import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import * as Sentry from '@sentry/node';
import { type ApiError, ErrorCode } from '@vpn/types';
import { env, isDevelopment } from './config/env.js';
import { AppError } from './lib/errors.js';
import { redisPlugin } from './plugins/redis.js';
import { healthRoutes } from './routes/health.js';
import {
  DrizzleDeviceRepository,
  type DeviceRepository,
} from './modules/device/device.repository.js';
import {
  DrizzleLedgerRepository,
  type LedgerRepository,
} from './modules/ledger/ledger.repository.js';
import {
  DrizzleRemoteConfigRepository,
  type RemoteConfigRepository,
} from './modules/remote-config/remote-config.repository.js';
import {
  DrizzleAdSessionRepository,
  type AdSessionRepository,
} from './modules/ads/ad-session.repository.js';
import {
  DrizzleRewardTransactionRepository,
  type RewardTransactionRepository,
} from './modules/ads/reward-transaction.repository.js';
import {
  DrizzleAdProviderRepository,
  type AdProviderRepository,
} from './modules/ads/ad-provider.repository.js';
import {
  DrizzleAdminRepository,
  DrizzleAuditLogRepository,
  type AdminRepository,
  type AuditLogRepository,
} from './modules/admin/admin.repository.js';
import {
  DrizzleEmergencyLogRepository,
  type EmergencyLogRepository,
} from './modules/emergency/emergency-log.repository.js';
import { EmergencyService } from './modules/emergency/emergency.service.js';
import {
  DrizzleFraudEventRepository,
  type FraudEventRepository,
} from './modules/fraud/fraud-event.repository.js';
import { FraudService } from './modules/fraud/fraud.service.js';
import { RedisRateLimiter, type RateLimiter } from './modules/fraud/rate-limiter.js';
import {
  NoopIntegrityVerifier,
  PlayIntegrityVerifier,
  type IntegrityVerifier,
} from './modules/fraud/integrity-verifier.js';
import {
  DrizzleBannerRepository,
  type BannerRepository,
} from './modules/notifications/banner.repository.js';
import { BannerService } from './modules/notifications/banner.service.js';
import {
  DrizzlePushTokenRepository,
  type PushTokenRepository,
} from './modules/notifications/push-token.repository.js';
import {
  DrizzlePushCampaignRepository,
  type PushCampaignRepository,
} from './modules/notifications/push-campaign.repository.js';
import { PushService } from './modules/notifications/push.service.js';
import {
  FcmPushSender,
  NoopPushSender,
  type PushSender,
} from './modules/notifications/push-sender.js';
import {
  InlinePushDispatcher,
  type PushDispatcher,
} from './modules/notifications/push-dispatcher.js';
import { notificationsRoutes } from './modules/notifications/notifications.routes.js';
import { DeviceService } from './modules/device/device.service.js';
import { RemoteConfigService } from './modules/remote-config/remote-config.service.js';
import { RewardService } from './modules/ads/reward.service.js';
import { AdsService } from './modules/ads/ads.service.js';
import { AdProviderService } from './modules/ads/ad-provider.service.js';
import { AdMobSsvVerifier, NoopSsvVerifier, type SsvVerifier } from './modules/ads/ssv-verifier.js';
import { AdminAuthService } from './modules/admin/admin-auth.service.js';
import { AdminService } from './modules/admin/admin.service.js';
import {
  DrizzleVpnServerRepository,
  type VpnServerRepository,
} from './modules/vpn/vpn-server.repository.js';
import {
  DrizzleVpnSessionRepository,
  type VpnSessionRepository,
} from './modules/vpn/vpn-session.repository.js';
import {
  DrizzleVpnProviderRepository,
  type VpnProviderRepository,
} from './modules/vpn/vpn-provider.repository.js';
import { RedisVpnSessionStore, type VpnSessionStore } from './modules/vpn/vpn-session-store.js';
import { VpnService } from './modules/vpn/vpn.service.js';
import { AdminVpnService } from './modules/admin/admin-vpn.service.js';
import { deviceRoutes } from './modules/device/device.routes.js';
import { appConfigRoutes } from './modules/app/app.routes.js';
import { adsRoutes } from './modules/ads/ads.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { vpnRoutes } from './modules/vpn/vpn.routes.js';

/** Pluggable data layer — defaults to Drizzle/MySQL, swapped for fakes in tests. */
export interface Repositories {
  devices: DeviceRepository;
  ledger: LedgerRepository;
  remoteConfig: RemoteConfigRepository;
  adSessions: AdSessionRepository;
  rewardTransactions: RewardTransactionRepository;
  adProviders: AdProviderRepository;
  admins: AdminRepository;
  auditLogs: AuditLogRepository;
  vpnServers: VpnServerRepository;
  vpnSessions: VpnSessionRepository;
  vpnProviders: VpnProviderRepository;
  emergencyLogs: EmergencyLogRepository;
  banners: BannerRepository;
  pushTokens: PushTokenRepository;
  pushCampaigns: PushCampaignRepository;
  fraudEvents: FraudEventRepository;
}

export interface BuildServerOptions {
  repositories?: Repositories;
  /** Override the SSV verifier in tests. */
  ssvVerifier?: SsvVerifier;
  /** Override the live VPN session store (Redis by default) in tests. */
  vpnSessionStore?: VpnSessionStore;
  /** Override the push sender (no-op by default) in tests. */
  pushSender?: PushSender;
  /** Override the push dispatcher (inline by default) in tests. */
  pushDispatcher?: PushDispatcher;
  /** Override the anti-fraud rate limiter (Redis by default) in tests. */
  rateLimiter?: RateLimiter;
  /** Override the Play Integrity verifier in tests. */
  integrityVerifier?: IntegrityVerifier;
}

function createDrizzleRepositories(): Repositories {
  // Construction is free; the pool only dials on first query (see db/client).
  return {
    devices: new DrizzleDeviceRepository(),
    ledger: new DrizzleLedgerRepository(),
    remoteConfig: new DrizzleRemoteConfigRepository(),
    adSessions: new DrizzleAdSessionRepository(),
    rewardTransactions: new DrizzleRewardTransactionRepository(),
    adProviders: new DrizzleAdProviderRepository(),
    admins: new DrizzleAdminRepository(),
    auditLogs: new DrizzleAuditLogRepository(),
    vpnServers: new DrizzleVpnServerRepository(),
    vpnSessions: new DrizzleVpnSessionRepository(),
    vpnProviders: new DrizzleVpnProviderRepository(),
    emergencyLogs: new DrizzleEmergencyLogRepository(),
    banners: new DrizzleBannerRepository(),
    pushTokens: new DrizzlePushTokenRepository(),
    pushCampaigns: new DrizzlePushCampaignRepository(),
    fraudEvents: new DrizzleFraudEventRepository(),
  };
}

/**
 * Builds (but does not start) the Fastify instance. Side-effect-free so it can
 * be reused by `index.ts` and by tests via `app.inject(...)`.
 */
export async function buildServer(opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: isDevelopment ? { target: 'pino-pretty' } : undefined,
      serializers: {
        // Strip the query string from logged URLs so the signed AdMob SSV
        // callback (signature, user_id, custom_data) never lands in logs or
        // Sentry breadcrumbs (CLAUDE.md §9, review M3). Keeps method + path.
        req(request: FastifyRequest) {
          const url = typeof request.url === 'string' ? request.url.split('?')[0] : request.url;
          return {
            method: request.method,
            url,
            hostname: request.hostname,
            remoteAddress: request.ip,
          };
        },
      },
    },
  });

  // Unified error envelope with canonical codes only (CLAUDE.md §8). Never echo
  // driver/framework codes (e.g. ER_DUP_ENTRY, FST_ERR_*) to the client. Set
  // BEFORE registering routes so their encapsulated contexts inherit it.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const isValidation = error.validation != null || error.code === 'FST_ERR_VALIDATION';

    let statusCode: number;
    let code: ErrorCode;
    if (error instanceof AppError) {
      statusCode = error.statusCode;
      code = error.errorCode;
    } else if (isValidation) {
      statusCode = 400;
      code = ErrorCode.ValidationError;
    } else {
      statusCode = error.statusCode ?? 500;
      code = statusCode === 400 ? ErrorCode.ValidationError : ErrorCode.Internal;
    }

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'request failed');
      if (env.SENTRY_DSN) Sentry.captureException(error);
    } else {
      request.log.warn({ err: error }, 'request rejected');
    }

    const body: ApiError = {
      error: {
        code,
        message: statusCode >= 500 ? 'Internal Server Error' : error.message,
      },
    };
    reply.status(statusCode).send(body);
  });

  await app.register(helmet);
  await app.register(cors, { origin: true });
  await app.register(sensible);
  await app.register(redisPlugin);

  const repos = opts.repositories ?? createDrizzleRepositories();

  // Anti-fraud (§9). Rate limiter + integrity verifier are swappable for tests.
  const rateLimiter: RateLimiter = opts.rateLimiter ?? new RedisRateLimiter();
  const integrityVerifier: IntegrityVerifier =
    opts.integrityVerifier ??
    (env.PLAY_INTEGRITY_ENABLED
      ? new PlayIntegrityVerifier(env.PLAY_INTEGRITY_PROJECT_NUMBER)
      : new NoopIntegrityVerifier());
  const fraudService = new FraudService(
    repos.devices,
    repos.fraudEvents,
    repos.remoteConfig,
    rateLimiter,
    integrityVerifier,
    env.PLAY_INTEGRITY_ENABLED,
  );

  const deviceService = new DeviceService(repos.devices, repos.ledger, fraudService, app.log);
  const remoteConfigService = new RemoteConfigService(repos.remoteConfig);
  const rewardService = new RewardService(
    repos.ledger,
    repos.rewardTransactions,
    remoteConfigService,
  );
  const adsService = new AdsService(
    repos.adSessions,
    repos.devices,
    repos.ledger,
    rewardService,
    fraudService,
  );
  const adProviderService = new AdProviderService(repos.adProviders, repos.auditLogs);
  const ssvVerifier: SsvVerifier =
    opts.ssvVerifier ?? (env.ADMOB_SSV_VERIFY ? new AdMobSsvVerifier() : new NoopSsvVerifier());
  if (!env.ADMOB_SSV_VERIFY && !opts.ssvVerifier) {
    app.log.warn('ADMOB_SSV_VERIFY=false — AdMob SSV signatures are NOT verified');
  }

  await app.register(healthRoutes);
  await app.register(deviceRoutes, { service: deviceService });
  await app.register(appConfigRoutes, { service: remoteConfigService });
  const emergencyService = new EmergencyService(
    repos.devices,
    repos.ledger,
    repos.emergencyLogs,
    repos.remoteConfig,
  );
  await app.register(adsRoutes, {
    ads: adsService,
    adProviders: adProviderService,
    verifier: ssvVerifier,
    remoteConfig: remoteConfigService,
    emergency: emergencyService,
    rewardedUnitId: env.ADMOB_REWARDED_UNIT_ID,
  });

  const adminAuthService = new AdminAuthService(repos.admins);
  const adminService = new AdminService(
    repos.devices,
    repos.ledger,
    repos.adSessions,
    repos.auditLogs,
    repos.remoteConfig,
    repos.emergencyLogs,
  );
  const adminVpnService = new AdminVpnService(
    repos.vpnProviders,
    repos.vpnServers,
    repos.auditLogs,
  );
  const bannerService = new BannerService(
    repos.banners,
    repos.devices,
    repos.ledger,
    repos.auditLogs,
  );

  const pushSender: PushSender =
    opts.pushSender ??
    (env.FCM_ENABLED ? new FcmPushSender(env.FCM_PROJECT_ID) : new NoopPushSender());
  if (env.FCM_ENABLED && !opts.pushSender && !env.FCM_SERVICE_ACCOUNT) {
    app.log.warn('FCM_ENABLED=true but FCM_SERVICE_ACCOUNT is unset — push send will fail');
  }
  const pushService = new PushService(
    repos.pushTokens,
    repos.pushCampaigns,
    repos.devices,
    repos.ledger,
    repos.auditLogs,
    pushSender,
  );
  // Delivery runs out-of-band so the HTTP handler returns immediately (§6).
  const pushDispatcher: PushDispatcher =
    opts.pushDispatcher ?? new InlinePushDispatcher((id) => pushService.sendCampaign(id), app.log);

  await app.register(notificationsRoutes, { banners: bannerService, push: pushService });
  await app.register(adminRoutes, {
    auth: adminAuthService,
    admin: adminService,
    vpn: adminVpnService,
    banners: bannerService,
    adProviders: adProviderService,
    push: pushService,
    pushDispatcher,
    fraud: fraudService,
    jwtSecret: env.JWT_SECRET,
    tokenTtl: env.ADMIN_TOKEN_TTL,
  });

  const vpnSessionStore = opts.vpnSessionStore ?? new RedisVpnSessionStore();
  const vpnService = new VpnService(
    repos.vpnServers,
    repos.vpnSessions,
    vpnSessionStore,
    repos.devices,
    repos.ledger,
  );
  await app.register(vpnRoutes, { vpn: vpnService });

  return app;
}
