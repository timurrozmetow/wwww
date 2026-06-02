import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../server.js';
import {
  createInMemoryRepositories,
  type InMemoryRepositories,
} from '../../test-support/in-memory.js';
import { AdminAuthService } from '../admin/admin-auth.service.js';
import { PushService } from './push.service.js';
import type { PushDispatcher } from './push-dispatcher.js';
import {
  NoopPushSender,
  type PushMessage,
  type PushSendResult,
  type PushSender,
} from './push-sender.js';

// --- helpers ----------------------------------------------------------------

class CapturingSender implements PushSender {
  readonly messages: PushMessage[] = [];
  async send(messages: PushMessage[]): Promise<PushSendResult> {
    this.messages.push(...messages);
    return { sent: messages.length, failed: 0, invalidTokens: [] };
  }
  get tokens(): string[] {
    return this.messages.map((m) => m.token);
  }
}

class ThrowingSender implements PushSender {
  async send(): Promise<PushSendResult> {
    throw new Error('fcm transport down');
  }
}

class RecordingDispatcher implements PushDispatcher {
  readonly enqueued: number[] = [];
  async enqueue(id: number): Promise<void> {
    this.enqueued.push(id);
  }
}

function makeService(sender: PushSender = new NoopPushSender()): {
  repos: InMemoryRepositories;
  service: PushService;
} {
  const repos = createInMemoryRepositories();
  const service = new PushService(
    repos.pushTokens,
    repos.pushCampaigns,
    repos.devices,
    repos.ledger,
    repos.auditLogs,
    sender,
  );
  return { repos, service };
}

async function addDevice(
  repos: InMemoryRepositories,
  id: string,
  opts: { language?: 'ru' | 'tr' | 'tk'; country?: string | null; blocked?: boolean } = {},
): Promise<void> {
  await repos.devices.create({
    id,
    installId: `inst-${id}`,
    appVersion: '1.0.0',
    platform: 'android',
    language: opts.language ?? 'ru',
    country: opts.country ?? 'TM',
  });
  if (opts.blocked) await repos.devices.setBlocked(id, true);
}

// --- token registration -----------------------------------------------------

describe('PushService.registerToken', () => {
  it('stores a token for a known device, idempotent on re-register', async () => {
    const { repos, service } = makeService();
    await addDevice(repos, 'dev-1');

    await service.registerToken('dev-1', 'tok-1');
    await service.registerToken('dev-1', 'tok-1'); // same token again
    const enabled = await repos.pushTokens.listEnabled();
    expect(enabled).toHaveLength(1);
    expect(enabled.map((t) => t.deviceId)).toEqual(['dev-1']);
  });

  it('re-points an existing token to a new device on reinstall', async () => {
    const { repos, service } = makeService();
    await addDevice(repos, 'dev-1');
    await addDevice(repos, 'dev-2');

    await service.registerToken('dev-1', 'tok-shared');
    await service.registerToken('dev-2', 'tok-shared');
    const enabled = await repos.pushTokens.listEnabled();
    expect(enabled).toHaveLength(1);
    expect(enabled.map((t) => t.deviceId)).toEqual(['dev-2']);
  });

  it('rejects an unknown device', async () => {
    const { service } = makeService();
    await expect(service.registerToken('ghost', 'tok')).rejects.toThrow('Device not found');
  });
});

// --- targeting / delivery ---------------------------------------------------

describe('PushService.sendCampaign targeting', () => {
  it('filters by language', async () => {
    const sender = new CapturingSender();
    const { repos, service } = makeService(sender);
    await addDevice(repos, 'ru-dev', { language: 'ru' });
    await addDevice(repos, 'tr-dev', { language: 'tr' });
    await repos.pushTokens.upsert('ru-dev', 'tok-ru');
    await repos.pushTokens.upsert('tr-dev', 'tok-tr');

    const c = await repos.pushCampaigns.create({ title: 'Hi', body: 'B', language: 'tr' });
    const summary = await service.sendCampaign(c.id);

    expect(summary.recipientCount).toBe(1);
    expect(summary.sentCount).toBe(1);
    expect(sender.tokens).toEqual(['tok-tr']);
  });

  it('filters by country', async () => {
    const sender = new CapturingSender();
    const { repos, service } = makeService(sender);
    await addDevice(repos, 'tm-dev', { country: 'TM' });
    await addDevice(repos, 'tr-dev', { country: 'TR' });
    await repos.pushTokens.upsert('tm-dev', 'tok-tm');
    await repos.pushTokens.upsert('tr-dev', 'tok-tr');

    const c = await repos.pushCampaigns.create({ title: 'Hi', body: 'B', country: 'TR' });
    await service.sendCampaign(c.id);
    expect(sender.tokens).toEqual(['tok-tr']);
  });

  it('filters by balance segment (zero_balance)', async () => {
    const sender = new CapturingSender();
    const { repos, service } = makeService(sender);
    await addDevice(repos, 'broke');
    await addDevice(repos, 'rich');
    repos.ledger.add('rich', 60);
    await repos.pushTokens.upsert('broke', 'tok-broke');
    await repos.pushTokens.upsert('rich', 'tok-rich');

    const c = await repos.pushCampaigns.create({ title: 'Hi', body: 'B', segment: 'zero_balance' });
    await service.sendCampaign(c.id);
    expect(sender.tokens).toEqual(['tok-broke']);
  });

  it('excludes blocked devices and reaches everyone for an "all" campaign', async () => {
    const sender = new CapturingSender();
    const { repos, service } = makeService(sender);
    await addDevice(repos, 'ok-dev');
    await addDevice(repos, 'bad-dev', { blocked: true });
    await repos.pushTokens.upsert('ok-dev', 'tok-ok');
    await repos.pushTokens.upsert('bad-dev', 'tok-bad');

    const c = await repos.pushCampaigns.create({ title: 'Hi', body: 'B' });
    const summary = await service.sendCampaign(c.id);
    expect(summary.recipientCount).toBe(1);
    expect(sender.tokens).toEqual(['tok-ok']);
  });

  it('disables tokens the sender reports invalid, marks sent + records counts', async () => {
    class FlakySender implements PushSender {
      async send(messages: PushMessage[]): Promise<PushSendResult> {
        const invalidTokens = messages.filter((m) => m.token === 'tok-dead').map((m) => m.token);
        return {
          sent: messages.length - invalidTokens.length,
          failed: invalidTokens.length,
          invalidTokens,
        };
      }
    }
    const { repos, service } = makeService(new FlakySender());
    await addDevice(repos, 'a');
    await addDevice(repos, 'b');
    await repos.pushTokens.upsert('a', 'tok-live');
    await repos.pushTokens.upsert('b', 'tok-dead');

    const c = await repos.pushCampaigns.create({ title: 'Hi', body: 'B' });
    const summary = await service.sendCampaign(c.id);

    expect(summary.recipientCount).toBe(2);
    expect(summary.sentCount).toBe(1);
    expect(summary.failedCount).toBe(1);
    const stillEnabled = (await repos.pushTokens.listEnabled()).map((t) => t.token);
    expect(stillEnabled).toEqual(['tok-live']);

    const reloaded = await repos.pushCampaigns.findById(c.id);
    expect(reloaded?.status).toBe('sent');
    expect(reloaded?.sentCount).toBe(1);
    expect(reloaded?.sentAt).not.toBeNull();
  });

  it('marks the campaign failed when the transport throws', async () => {
    const { repos, service } = makeService(new ThrowingSender());
    await addDevice(repos, 'a');
    await repos.pushTokens.upsert('a', 'tok');
    const c = await repos.pushCampaigns.create({ title: 'Hi', body: 'B' });

    const summary = await service.sendCampaign(c.id);
    expect(summary.sentCount).toBe(0);
    const reloaded = await repos.pushCampaigns.findById(c.id);
    expect(reloaded?.status).toBe('failed');
  });
});

// --- admin routes -----------------------------------------------------------

async function setupRoutes(): Promise<{
  app: FastifyInstance;
  repos: InMemoryRepositories;
  dispatcher: RecordingDispatcher;
  headers: Record<string, string>;
}> {
  const repos = createInMemoryRepositories();
  await new AdminAuthService(repos.admins).createAdmin('admin@test', 'secret123', 'admin');
  const dispatcher = new RecordingDispatcher();
  const app = await buildServer({ repositories: repos, pushDispatcher: dispatcher });
  await app.ready();
  const login = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { email: 'admin@test', password: 'secret123' },
  });
  return {
    app,
    repos,
    dispatcher,
    headers: { authorization: `Bearer ${login.json().token as string}` },
  };
}

describe('Push routes', () => {
  it('client registers a push token (404 for unknown device)', async () => {
    const { app, repos } = await setupRoutes();
    await addDevice(repos, 'dev-1');

    const ok = await app.inject({
      method: 'POST',
      url: '/api/notifications/push-token',
      headers: { 'x-device-id': 'dev-1' },
      payload: { token: 'fcm-token-xyz' },
    });
    expect(ok.statusCode).toBe(200);
    expect((await repos.pushTokens.listEnabled()).map((t) => t.token)).toEqual(['fcm-token-xyz']);

    const ghost = await app.inject({
      method: 'POST',
      url: '/api/notifications/push-token',
      headers: { 'x-device-id': 'nope' },
      payload: { token: 't' },
    });
    expect(ghost.statusCode).toBe(404);
    await app.close();
  });

  it('admin campaign routes require auth', async () => {
    const { app } = await setupRoutes();
    const res = await app.inject({ method: 'GET', url: '/api/admin/push/campaigns' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('creates a draft campaign, then send enqueues it and flips to sending (audited)', async () => {
    const { app, dispatcher, headers } = await setupRoutes();

    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/push/campaigns',
      headers,
      payload: { title: 'Promo', body: 'Watch an ad', segment: 'zero_balance' },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().status).toBe('draft');
    const id = created.json().id as number;

    const sent = await app.inject({
      method: 'POST',
      url: `/api/admin/push/campaigns/${id}/send`,
      headers,
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().status).toBe('sending');
    expect(dispatcher.enqueued).toEqual([id]);

    // Second send is rejected — only a draft can be started.
    const again = await app.inject({
      method: 'POST',
      url: `/api/admin/push/campaigns/${id}/send`,
      headers,
    });
    expect(again.statusCode).toBe(400);

    const logs = await app.inject({ method: 'GET', url: '/api/admin/logs', headers });
    const actions = logs.json().map((l: { action: string }) => l.action);
    expect(actions).toContain('push.campaign.create');
    expect(actions).toContain('push.campaign.send');
    await app.close();
  });
});
