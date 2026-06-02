import type { FastifyPluginAsync } from 'fastify';
import {
  type BalanceResponse,
  type DeviceRegisterRequest,
  type HeartbeatRequest,
  LANGUAGES,
  PLATFORMS,
} from '@vpn/types';
import type { DeviceService } from './device.service.js';

interface DeviceRoutesOptions {
  service: DeviceService;
}

const deviceIdHeaderSchema = {
  type: 'object',
  required: ['x-device-id'],
  properties: {
    'x-device-id': { type: 'string', minLength: 1, maxLength: 36 },
  },
} as const;

const profileResponseSchema = {
  type: 'object',
  required: ['deviceId', 'language', 'country', 'balanceMinutes', 'isBlocked', 'createdAt'],
  properties: {
    deviceId: { type: 'string' },
    language: { type: 'string' },
    country: { type: ['string', 'null'] },
    balanceMinutes: { type: 'integer' },
    isBlocked: { type: 'boolean' },
    createdAt: { type: 'string' },
  },
} as const;

const balanceResponseSchema = {
  type: 'object',
  required: ['deviceId', 'balanceMinutes', 'serverTime'],
  properties: {
    deviceId: { type: 'string' },
    balanceMinutes: { type: 'integer' },
    serverTime: { type: 'string' },
  },
} as const;

export const deviceRoutes: FastifyPluginAsync<DeviceRoutesOptions> = async (app, opts) => {
  app.post<{ Body: DeviceRegisterRequest }>(
    '/api/device/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['installId', 'appVersion', 'platform', 'language'],
          additionalProperties: false,
          properties: {
            deviceId: { type: 'string', maxLength: 36 },
            installId: { type: 'string', minLength: 1, maxLength: 64 },
            appVersion: { type: 'string', minLength: 1, maxLength: 32 },
            platform: { type: 'string', enum: [...PLATFORMS] },
            language: { type: 'string', enum: [...LANGUAGES] },
            country: { type: 'string', maxLength: 8 },
            timezone: { type: 'string', maxLength: 64 },
            deviceIntegrityStatus: { type: 'string', maxLength: 32 },
            integrityToken: { type: 'string', maxLength: 8192 },
          },
        },
        response: { 200: profileResponseSchema },
      },
    },
    (req) => opts.service.register(req.body),
  );

  app.post<{ Headers: { 'x-device-id': string }; Body: HeartbeatRequest }>(
    '/api/device/heartbeat',
    {
      schema: {
        headers: deviceIdHeaderSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { appVersion: { type: 'string', maxLength: 32 } },
        },
        response: { 200: balanceResponseSchema },
      },
    },
    (req) => opts.service.heartbeat(req.headers['x-device-id'], req.body?.appVersion),
  );

  app.get<{ Headers: { 'x-device-id': string } }>(
    '/api/rewards/balance',
    {
      schema: {
        headers: deviceIdHeaderSchema,
        response: { 200: balanceResponseSchema },
      },
    },
    async (req): Promise<BalanceResponse> => {
      const { deviceId, balanceMinutes } = await opts.service.getBalance(
        req.headers['x-device-id'],
      );
      return { deviceId, balanceMinutes, serverTime: new Date().toISOString() };
    },
  );
};
