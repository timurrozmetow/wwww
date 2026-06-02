import type { FastifyInstance } from 'fastify';
import { API_VERSION, type HealthResponse } from '@vpn/types';

const SERVICE_NAME = 'vpn-backend';
const SERVICE_VERSION = '0.0.1';

/** Liveness probe. Cheap, dependency-free — safe for load balancers to poll. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['status', 'service', 'version', 'apiVersion', 'uptimeSeconds', 'timestamp'],
            properties: {
              status: { type: 'string', enum: ['ok'] },
              service: { type: 'string' },
              version: { type: 'string' },
              apiVersion: { type: 'string' },
              uptimeSeconds: { type: 'number' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (): Promise<HealthResponse> => ({
      status: 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      apiVersion: API_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }),
  );
}
