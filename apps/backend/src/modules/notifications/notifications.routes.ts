import type { FastifyPluginAsync } from 'fastify';
import type { BannerView, PushTokenRegisterRequest } from '@vpn/types';
import type { BannerService } from './banner.service.js';
import type { PushService } from './push.service.js';

interface NotificationsRoutesOptions {
  banners: BannerService;
  push: PushService;
}

const deviceIdHeaderSchema = {
  type: 'object',
  required: ['x-device-id'],
  properties: { 'x-device-id': { type: 'string', minLength: 1, maxLength: 36 } },
} as const;

export const notificationsRoutes: FastifyPluginAsync<NotificationsRoutesOptions> = async (
  app,
  opts,
) => {
  app.get<{ Headers: { 'x-device-id': string } }>(
    '/api/notifications/in-app',
    { schema: { headers: deviceIdHeaderSchema } },
    (req): Promise<BannerView[]> => opts.banners.activeForDevice(req.headers['x-device-id']),
  );

  // Device registers / refreshes its FCM token. Idempotent on the token.
  app.post<{ Headers: { 'x-device-id': string }; Body: PushTokenRegisterRequest }>(
    '/api/notifications/push-token',
    {
      schema: {
        headers: deviceIdHeaderSchema,
        body: {
          type: 'object',
          required: ['token'],
          additionalProperties: false,
          properties: { token: { type: 'string', minLength: 1, maxLength: 255 } },
        },
      },
    },
    async (req) => {
      await opts.push.registerToken(req.headers['x-device-id'], req.body.token);
      return { ok: true };
    },
  );
};
