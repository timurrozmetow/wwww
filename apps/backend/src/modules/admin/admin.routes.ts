import jwt from '@fastify/jwt';
import type { FastifyPluginAsync } from 'fastify';
import type {
  AdminAdProviderUpdate,
  AdminBannerCreate,
  AdminLoginRequest,
  AdminLoginResponse,
  AdminProfile,
  AdminPushCampaignCreate,
  AdminRole,
  AdminVpnProviderCreate,
  AdminVpnServerCreate,
  EconomyInputs,
  RemoteConfigSetRequest,
} from '@vpn/types';
import { UnauthorizedError } from '../../lib/errors.js';
import { calculateEconomy } from '../economy/calculate.js';
import type { AdProviderService } from '../ads/ad-provider.service.js';
import type { FraudService } from '../fraud/fraud.service.js';
import type { BannerService } from '../notifications/banner.service.js';
import type { PushService } from '../notifications/push.service.js';
import type { PushDispatcher } from '../notifications/push-dispatcher.js';
import type { AdminAuthService } from './admin-auth.service.js';
import type { AdminService } from './admin.service.js';
import type { AdminVpnService } from './admin-vpn.service.js';

const bannerCreateSchema = {
  type: 'object',
  required: ['title', 'body'],
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 128 },
    body: { type: 'string', minLength: 1, maxLength: 512 },
    imageUrl: { type: 'string', maxLength: 512 },
    deeplink: { type: 'string', maxLength: 255 },
    language: { type: 'string', enum: ['ru', 'tr', 'tk'] },
    segment: { type: 'string', enum: ['all', 'zero_balance', 'has_balance'] },
    startsAt: { type: 'string' },
    endsAt: { type: 'string' },
    priority: { type: 'integer' },
  },
} as const;

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer' } },
} as const;

const toggleBodySchema = {
  type: 'object',
  required: ['enabled'],
  additionalProperties: false,
  properties: { enabled: { type: 'boolean' } },
} as const;

const vpnProviderCreateSchema = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 64 },
    type: { type: 'string', maxLength: 24 },
    priority: { type: 'integer' },
  },
} as const;

const remoteConfigSetSchema = {
  type: 'object',
  required: ['key', 'value'],
  additionalProperties: false,
  properties: {
    key: { type: 'string', minLength: 1, maxLength: 64 },
    value: { type: 'string', maxLength: 4096 },
    valueType: { type: 'string', enum: ['string', 'number', 'boolean', 'json'] },
  },
} as const;

const vpnServerCreateSchema = {
  type: 'object',
  required: ['providerId', 'country', 'name'],
  additionalProperties: false,
  properties: {
    providerId: { type: 'string', maxLength: 36 },
    country: { type: 'string', maxLength: 8 },
    name: { type: 'string', minLength: 1, maxLength: 64 },
    city: { type: 'string', maxLength: 64 },
    host: { type: 'string', maxLength: 255 },
    configBlob: { type: 'string' },
    pingMs: { type: 'integer', minimum: 0 },
    loadPercent: { type: 'integer', minimum: 0, maximum: 100 },
    status: { type: 'string', maxLength: 16 },
    priority: { type: 'integer' },
    countryPriority: { type: 'integer' },
  },
} as const;

const pushCampaignCreateSchema = {
  type: 'object',
  required: ['title', 'body'],
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 128 },
    body: { type: 'string', minLength: 1, maxLength: 512 },
    language: { type: 'string', enum: ['ru', 'tr', 'tk'] },
    segment: { type: 'string', enum: ['all', 'zero_balance', 'has_balance'] },
    country: { type: 'string', maxLength: 8 },
  },
} as const;

const adProviderUpdateSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    priority: { type: 'integer' },
    ecpmEstimate: { type: 'number', minimum: 0 },
    fillRate: { type: 'number', minimum: 0, maximum: 1 },
    adUnitId: { type: 'string', minLength: 1, maxLength: 128 },
    timeoutMs: { type: 'integer', minimum: 500, maximum: 60000 },
    enabled: { type: 'boolean' },
  },
} as const;

const economyInputSchema = {
  type: 'object',
  required: [
    'activeUsers',
    'avgVpnHoursPerUserPerDay',
    'rewardMinutesPerAd',
    'eCPM',
    'fillRate',
    'avgGbPerHour',
    'trafficCostPerTb',
  ],
  additionalProperties: false,
  properties: {
    activeUsers: { type: 'number', minimum: 0 },
    avgVpnHoursPerUserPerDay: { type: 'number', minimum: 0 },
    rewardMinutesPerAd: { type: 'number', minimum: 1 },
    eCPM: { type: 'number', minimum: 0 },
    fillRate: { type: 'number', minimum: 0, maximum: 1 },
    avgGbPerHour: { type: 'number', minimum: 0 },
    trafficCostPerTb: { type: 'number', minimum: 0 },
  },
} as const;

interface AdminRoutesOptions {
  auth: AdminAuthService;
  admin: AdminService;
  vpn: AdminVpnService;
  banners: BannerService;
  adProviders: AdProviderService;
  push: PushService;
  pushDispatcher: PushDispatcher;
  fraud: FraudService;
  jwtSecret: string;
  tokenTtl: string;
}

interface AdminJwtPayload {
  sub: number;
  email: string;
  role: AdminRole;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AdminJwtPayload;
    user: AdminJwtPayload;
  }
}

export const adminRoutes: FastifyPluginAsync<AdminRoutesOptions> = async (app, opts) => {
  await app.register(jwt, { secret: opts.jwtSecret });

  app.post<{ Body: AdminLoginRequest }>(
    '/api/admin/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', minLength: 3, maxLength: 191 },
            password: { type: 'string', minLength: 1, maxLength: 256 },
          },
        },
      },
    },
    async (req): Promise<AdminLoginResponse> => {
      const admin = await opts.auth.verifyCredentials(req.body.email, req.body.password);
      const token = app.jwt.sign(
        { sub: admin.id, email: admin.email, role: admin.role as AdminRole },
        { expiresIn: opts.tokenTtl },
      );
      return { token, admin: opts.auth.toProfile(admin) };
    },
  );

  // Everything below requires a valid admin JWT.
  await app.register(async (guarded) => {
    guarded.addHook('onRequest', async (req) => {
      try {
        await req.jwtVerify();
      } catch {
        throw new UnauthorizedError('Missing or invalid token');
      }
    });

    guarded.get(
      '/api/admin/me',
      (req): AdminProfile => ({
        id: req.user.sub,
        email: req.user.email,
        role: req.user.role,
      }),
    );

    guarded.get('/api/admin/dashboard', () => opts.admin.dashboard());

    guarded.get<{ Querystring: { page?: number; pageSize?: number } }>(
      '/api/admin/devices',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              page: { type: 'integer', minimum: 1, default: 1 },
              pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
          },
        },
      },
      (req) => opts.admin.listDevices(req.query.page ?? 1, req.query.pageSize ?? 20),
    );

    guarded.get<{ Params: { id: string } }>('/api/admin/devices/:id', (req) =>
      opts.admin.getDevice(req.params.id),
    );

    guarded.post<{ Params: { id: string } }>('/api/admin/devices/:id/block', async (req) => {
      await opts.admin.setDeviceBlocked(req.user.sub, req.params.id, true);
      return { ok: true };
    });

    guarded.post<{ Params: { id: string } }>('/api/admin/devices/:id/unblock', async (req) => {
      await opts.admin.setDeviceBlocked(req.user.sub, req.params.id, false);
      return { ok: true };
    });

    guarded.get('/api/admin/logs', () => opts.admin.auditLogs());

    guarded.get('/api/admin/economy/overview', () => opts.admin.economyOverview());

    guarded.post<{ Body: EconomyInputs }>(
      '/api/admin/economy/calculate',
      { schema: { body: economyInputSchema } },
      (req) => calculateEconomy(req.body),
    );

    // --- VPN management ---------------------------------------------------
    guarded.get('/api/admin/vpn/providers', () => opts.vpn.listProviders());

    guarded.post<{ Body: AdminVpnProviderCreate }>(
      '/api/admin/vpn/providers',
      { schema: { body: vpnProviderCreateSchema } },
      (req) => opts.vpn.createProvider(req.user.sub, req.body),
    );

    guarded.post<{ Params: { id: string }; Body: { enabled: boolean } }>(
      '/api/admin/vpn/providers/:id/toggle',
      { schema: { body: toggleBodySchema } },
      async (req) => {
        await opts.vpn.toggleProvider(req.user.sub, req.params.id, req.body.enabled);
        return { ok: true };
      },
    );

    guarded.get('/api/admin/vpn/servers', () => opts.vpn.listServers());

    guarded.post<{ Body: AdminVpnServerCreate }>(
      '/api/admin/vpn/servers',
      { schema: { body: vpnServerCreateSchema } },
      (req) => opts.vpn.createServer(req.user.sub, req.body),
    );

    guarded.post<{ Params: { id: string }; Body: { enabled: boolean } }>(
      '/api/admin/vpn/servers/:id/toggle',
      { schema: { body: toggleBodySchema } },
      async (req) => {
        await opts.vpn.toggleServer(req.user.sub, req.params.id, req.body.enabled);
        return { ok: true };
      },
    );

    guarded.delete<{ Params: { id: string } }>('/api/admin/vpn/servers/:id', async (req) => {
      await opts.vpn.deleteServer(req.user.sub, req.params.id);
      return { ok: true };
    });

    guarded.get('/api/admin/emergency/logs', () => opts.admin.emergencyLogsList());

    // --- Anti-fraud signal log (§9) ---------------------------------------
    guarded.get('/api/admin/fraud/events', () => opts.fraud.listEvents());

    // --- In-app banners ---------------------------------------------------
    guarded.get('/api/admin/banners', () => opts.banners.list());

    guarded.post<{ Body: AdminBannerCreate }>(
      '/api/admin/banners',
      { schema: { body: bannerCreateSchema } },
      (req) => opts.banners.create(req.user.sub, req.body),
    );

    guarded.post<{ Params: { id: number }; Body: { enabled: boolean } }>(
      '/api/admin/banners/:id/toggle',
      { schema: { params: idParamsSchema, body: toggleBodySchema } },
      async (req) => {
        await opts.banners.toggle(req.user.sub, req.params.id, req.body.enabled);
        return { ok: true };
      },
    );

    guarded.delete<{ Params: { id: number } }>(
      '/api/admin/banners/:id',
      { schema: { params: idParamsSchema } },
      async (req) => {
        await opts.banners.remove(req.user.sub, req.params.id);
        return { ok: true };
      },
    );

    // --- Push campaigns (FCM, targeted by language/segment/country) -------
    guarded.get('/api/admin/push/campaigns', () => opts.push.list());

    guarded.post<{ Body: AdminPushCampaignCreate }>(
      '/api/admin/push/campaigns',
      { schema: { body: pushCampaignCreateSchema } },
      (req) => opts.push.createCampaign(req.user.sub, req.body),
    );

    // Marks draft → sending, audits, then hands delivery to the dispatcher so the
    // request returns immediately (CLAUDE.md §6 — broadcasts run in a worker).
    guarded.post<{ Params: { id: number } }>(
      '/api/admin/push/campaigns/:id/send',
      { schema: { params: idParamsSchema } },
      async (req) => {
        const campaign = await opts.push.startCampaign(req.user.sub, req.params.id);
        await opts.pushDispatcher.enqueue(req.params.id);
        return campaign;
      },
    );

    // --- Ad providers / waterfall (drives GET /api/ads/waterfall-config) ---
    guarded.get('/api/admin/ads/providers', () => opts.adProviders.list());

    guarded.patch<{ Params: { id: number }; Body: AdminAdProviderUpdate }>(
      '/api/admin/ads/providers/:id',
      { schema: { params: idParamsSchema, body: adProviderUpdateSchema } },
      (req) => opts.adProviders.update(req.user.sub, req.params.id, req.body),
    );

    guarded.post<{ Params: { id: number }; Body: { enabled: boolean } }>(
      '/api/admin/ads/providers/:id/toggle',
      { schema: { params: idParamsSchema, body: toggleBodySchema } },
      async (req) => {
        await opts.adProviders.toggle(req.user.sub, req.params.id, req.body.enabled);
        return { ok: true };
      },
    );

    // --- Remote config (drives GET /api/app/config) -----------------------
    guarded.get('/api/admin/remote-config', () => opts.admin.listRemoteConfig());

    guarded.put<{ Body: RemoteConfigSetRequest }>(
      '/api/admin/remote-config',
      { schema: { body: remoteConfigSetSchema } },
      async (req) => {
        await opts.admin.setRemoteConfig(req.user.sub, req.body);
        return { ok: true };
      },
    );
  });
};
