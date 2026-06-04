import type { FastifyPluginAsync } from 'fastify';
import type {
  VpnHeartbeatRequest,
  VpnRecommendation,
  VpnServerView,
  VpnSessionCurrent,
  VpnSessionStartRequest,
  VpnSessionStartResponse,
  VpnSessionStopRequest,
} from '@vpn/types';
import { NotFoundError } from '../../lib/errors.js';
import type { VpnHealthService } from './vpn-health.service.js';
import type { VpnService } from './vpn.service.js';

interface VpnRoutesOptions {
  vpn: VpnService;
  health: VpnHealthService;
}

const deviceIdHeaderSchema = {
  type: 'object',
  required: ['x-device-id'],
  properties: { 'x-device-id': { type: 'string', minLength: 1, maxLength: 36 } },
} as const;

const sessionBodySchema = {
  type: 'object',
  required: ['sessionId', 'sessionToken'],
  additionalProperties: false,
  properties: {
    sessionId: { type: 'string', minLength: 1, maxLength: 36 },
    sessionToken: { type: 'string', minLength: 1, maxLength: 64 },
    bytesIn: { type: 'integer', minimum: 0 },
    bytesOut: { type: 'integer', minimum: 0 },
  },
} as const;

export const vpnRoutes: FastifyPluginAsync<VpnRoutesOptions> = async (app, opts) => {
  app.get('/api/vpn/servers', (): Promise<VpnServerView[]> => opts.vpn.listServers());

  // User-facing "check ping": triggers a backend-side sweep (throttled so taps
  // don't stack), then returns the refreshed catalog. The phone never pings (§6).
  app.post('/api/vpn/servers/recheck', async (): Promise<VpnServerView[]> => {
    await opts.health.pingAllThrottled();
    return opts.vpn.listServers();
  });

  app.get('/api/vpn/recommended', (): Promise<VpnRecommendation> => opts.vpn.recommend());

  app.post<{ Headers: { 'x-device-id': string }; Body: VpnSessionStartRequest }>(
    '/api/vpn/session/start',
    {
      schema: {
        headers: deviceIdHeaderSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { serverId: { type: 'string', maxLength: 36 } },
        },
      },
    },
    (req): Promise<VpnSessionStartResponse> =>
      opts.vpn.startSession(req.headers['x-device-id'], req.body?.serverId),
  );

  app.post<{ Body: VpnHeartbeatRequest }>(
    '/api/vpn/session/heartbeat',
    { schema: { body: sessionBodySchema } },
    (req) => opts.vpn.heartbeat(req.body),
  );

  app.post<{ Body: VpnSessionStopRequest }>(
    '/api/vpn/session/stop',
    { schema: { body: sessionBodySchema } },
    (req) => opts.vpn.stopSession(req.body),
  );

  app.get<{ Headers: { 'x-device-id': string } }>(
    '/api/vpn/session/current',
    { schema: { headers: deviceIdHeaderSchema } },
    async (req): Promise<VpnSessionCurrent> => {
      const current = await opts.vpn.current(req.headers['x-device-id']);
      if (!current) throw new NotFoundError('No active session');
      return current;
    },
  );
};
