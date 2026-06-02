import type { FastifyPluginAsync } from 'fastify';
import type {
  ApiError,
  AdSessionStartResponse,
  AdsConfig,
  AdWaterfallConfig,
  EmergencyResult,
  NoFillReportRequest,
} from '@vpn/types';
import type { RemoteConfigService } from '../remote-config/remote-config.service.js';
import type { EmergencyService } from '../emergency/emergency.service.js';
import type { AdProviderService } from './ad-provider.service.js';
import type { AdsService } from './ads.service.js';
import type { SsvVerifier } from './ssv-verifier.js';

interface AdsRoutesOptions {
  ads: AdsService;
  adProviders: AdProviderService;
  verifier: SsvVerifier;
  remoteConfig: RemoteConfigService;
  emergency: EmergencyService;
  rewardedUnitId: string;
}

const waterfallItemSchema = {
  type: 'object',
  required: ['key', 'name', 'adUnitId', 'timeoutMs', 'priority'],
  properties: {
    key: { type: 'string' },
    name: { type: 'string' },
    adUnitId: { type: 'string' },
    timeoutMs: { type: 'integer' },
    priority: { type: 'integer' },
  },
} as const;

interface AdMobSsvQuery {
  transaction_id: string;
  signature: string;
  key_id: string;
  custom_data: string;
  reward_amount?: string;
  reward_item?: string;
  ad_network?: string;
  ad_unit?: string;
  timestamp?: string;
  user_id?: string;
}

const deviceIdHeaderSchema = {
  type: 'object',
  required: ['x-device-id'],
  properties: {
    'x-device-id': { type: 'string', minLength: 1, maxLength: 36 },
  },
} as const;

export const adsRoutes: FastifyPluginAsync<AdsRoutesOptions> = async (app, opts) => {
  app.post<{ Headers: { 'x-device-id': string } }>(
    '/api/ads/session/start',
    {
      schema: {
        headers: deviceIdHeaderSchema,
        response: {
          200: {
            type: 'object',
            required: ['sessionId'],
            properties: { sessionId: { type: 'string' } },
          },
        },
      },
    },
    (req): Promise<AdSessionStartResponse> => opts.ads.startSession(req.headers['x-device-id']),
  );

  app.get(
    '/api/ads/config',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['provider', 'rewardedUnitId', 'rewardMinutes'],
            properties: {
              provider: { type: 'string' },
              rewardedUnitId: { type: 'string' },
              rewardMinutes: { type: 'integer' },
            },
          },
        },
      },
    },
    async (): Promise<AdsConfig> => {
      const cfg = await opts.remoteConfig.getAppConfig();
      return {
        provider: 'admob',
        rewardedUnitId: opts.rewardedUnitId,
        rewardMinutes: cfg.rewardMinutesPerAd,
      };
    },
  );

  // Backend-driven mediation waterfall — order/priorities change without an app
  // release. Enabled providers only; no eCPM / fill (those stay backend-side).
  app.get(
    '/api/ads/waterfall-config',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['providers'],
            properties: {
              providers: { type: 'array', items: waterfallItemSchema },
            },
          },
        },
      },
    },
    (): Promise<AdWaterfallConfig> => opts.adProviders.getWaterfall(),
  );

  // All ad networks failed → maybe grant emergency access (CLAUDE.md §7.7).
  app.post<{ Headers: { 'x-device-id': string }; Body: NoFillReportRequest }>(
    '/api/ads/no-fill-report',
    {
      schema: {
        headers: deviceIdHeaderSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { failedNetworksCount: { type: 'integer', minimum: 0, default: 0 } },
        },
      },
    },
    (req): Promise<EmergencyResult> =>
      opts.emergency.requestEmergency(
        req.headers['x-device-id'],
        req.body?.failedNetworksCount ?? 0,
      ),
  );

  // AdMob server-side verification callback. Reward is granted ONLY here, after
  // the signature checks out (CLAUDE.md §7.3). Idempotent on transaction_id.
  app.get<{ Querystring: AdMobSsvQuery }>(
    '/api/rewards/admob/ssv',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['transaction_id', 'signature', 'key_id', 'custom_data'],
          additionalProperties: true,
          properties: {
            transaction_id: { type: 'string' },
            signature: { type: 'string' },
            key_id: { type: 'string' },
            custom_data: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const q = req.query;

      // The signed content is the query string up to (not including) `&signature=`.
      const qIndex = req.url.indexOf('?');
      const qs = qIndex >= 0 ? req.url.slice(qIndex + 1) : '';
      const sigIndex = qs.indexOf('&signature=');
      const content = sigIndex >= 0 ? qs.slice(0, sigIndex) : qs;

      const valid = await opts.verifier.verify(content, q.signature, q.key_id);
      if (!valid) {
        req.log.warn({ keyId: q.key_id }, 'admob ssv signature verification failed');
        const body: ApiError = {
          error: { code: 'VALIDATION_ERROR', message: 'Invalid SSV signature' },
        };
        return reply.status(403).send(body);
      }

      const result = await opts.ads.grantSsvReward({
        sessionId: q.custom_data,
        transactionId: q.transaction_id,
        rawCallback: q,
      });
      return reply.status(200).send({ status: 'ok', granted: result.granted });
    },
  );
};
