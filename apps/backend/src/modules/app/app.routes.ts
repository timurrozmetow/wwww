import type { FastifyPluginAsync } from 'fastify';
import type { RemoteConfigService } from '../remote-config/remote-config.service.js';

interface AppRoutesOptions {
  service: RemoteConfigService;
}

const appConfigResponseSchema = {
  type: 'object',
  required: [
    'rewardMinutesPerAd',
    'emergencyMinutes',
    'maxBalanceDays',
    'maintenanceMode',
    'forceUpdate',
    'minAppVersion',
    'splitTunnelingEnabled',
    'featureFlags',
  ],
  properties: {
    rewardMinutesPerAd: { type: 'integer' },
    emergencyMinutes: { type: 'integer' },
    maxBalanceDays: { type: 'integer' },
    maintenanceMode: { type: 'boolean' },
    forceUpdate: { type: 'boolean' },
    minAppVersion: { type: 'string' },
    splitTunnelingEnabled: { type: 'boolean' },
    featureFlags: { type: 'object', additionalProperties: { type: 'boolean' } },
  },
} as const;

export const appConfigRoutes: FastifyPluginAsync<AppRoutesOptions> = async (app, opts) => {
  app.get('/api/app/config', { schema: { response: { 200: appConfigResponseSchema } } }, () =>
    opts.service.getAppConfig(),
  );
};
