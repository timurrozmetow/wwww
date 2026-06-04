import type {
  AdminVpnImportRequest,
  AdminVpnImportResult,
  AdminVpnPingEntry,
  AdminVpnPingResult,
  AdminVpnProvider,
  AdminVpnProviderCreate,
  AdminVpnServer,
  AdminVpnServerCreate,
} from '@vpn/types';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { HappDecodeError, type HappKeyring } from '../vpn/happ-decoder.js';
import { buildSingBoxConfigJson } from '../vpn/singbox-config.js';
import {
  resolveSubscription,
  SubscriptionError,
  type SubscriptionFetcher,
} from '../vpn/subscription.js';
import { VpnHealthService } from '../vpn/vpn-health.service.js';
import type { VpnProviderRepository, VpnProviderRow } from '../vpn/vpn-provider.repository.js';
import type { VpnServerRepository, VpnServerRow } from '../vpn/vpn-server.repository.js';
import type { AuditLogRepository } from './admin.repository.js';

const DEFAULT_IMPORT_LIMIT = 50;

function toServer(s: VpnServerRow): AdminVpnServer {
  return {
    id: s.id,
    providerId: s.providerId,
    country: s.country,
    city: s.city,
    name: s.name,
    host: s.host,
    status: s.status,
    pingMs: s.pingMs,
    loadPercent: s.loadPercent,
    priority: s.priority,
    countryPriority: s.countryPriority,
    enabled: s.enabled,
    createdAt: s.createdAt.toISOString(),
  };
}

export class AdminVpnService {
  constructor(
    private readonly providers: VpnProviderRepository,
    private readonly servers: VpnServerRepository,
    private readonly audit: AuditLogRepository,
    /** Happ decode keys (BYOK from env). Empty → happ:// links are rejected. */
    private readonly happKeyring: HappKeyring = {},
    /** Subscription fetcher override (tests inject a stub). */
    private readonly fetcher?: SubscriptionFetcher,
    /** Shared health service (measures latency). Tests inject one with a stub pinger. */
    private readonly health: VpnHealthService = new VpnHealthService(servers),
  ) {}

  async listProviders(): Promise<AdminVpnProvider[]> {
    const [providers, servers] = await Promise.all([
      this.providers.listAll(),
      this.servers.listAll(),
    ]);
    const counts = new Map<string, number>();
    for (const s of servers) counts.set(s.providerId, (counts.get(s.providerId) ?? 0) + 1);
    return providers.map((p) => this.toProvider(p, counts.get(p.id) ?? 0));
  }

  async createProvider(adminId: number, input: AdminVpnProviderCreate): Promise<AdminVpnProvider> {
    const provider = await this.providers.create(input);
    await this.audit.record({
      adminId,
      action: 'vpn.provider.create',
      targetType: 'vpn_provider',
      targetId: provider.id,
    });
    return this.toProvider(provider, 0);
  }

  async toggleProvider(adminId: number, id: string, enabled: boolean): Promise<void> {
    const provider = await this.providers.findById(id);
    if (!provider) throw new NotFoundError('Provider not found');
    await this.providers.setEnabled(id, enabled);
    await this.audit.record({
      adminId,
      action: enabled ? 'vpn.provider.enable' : 'vpn.provider.disable',
      targetType: 'vpn_provider',
      targetId: id,
    });
  }

  async listServers(): Promise<AdminVpnServer[]> {
    const servers = await this.servers.listAll();
    return servers.map(toServer);
  }

  async createServer(adminId: number, input: AdminVpnServerCreate): Promise<AdminVpnServer> {
    const provider = await this.providers.findById(input.providerId);
    if (!provider) throw new NotFoundError('Provider not found');
    const server = await this.servers.create(input);
    await this.audit.record({
      adminId,
      action: 'vpn.server.create',
      targetType: 'vpn_server',
      targetId: server.id,
    });
    return toServer(server);
  }

  /**
   * Imports servers from a pasted source (happ link / subscription URL / inline
   * list). Resolves → builds a sing-box configBlob per proxy → creates servers.
   */
  async importFromSource(
    adminId: number,
    input: AdminVpnImportRequest,
  ): Promise<AdminVpnImportResult> {
    const provider = await this.providers.findById(input.providerId);
    if (!provider) throw new NotFoundError('Provider not found');

    let resolved;
    try {
      resolved = await resolveSubscription(input.source, {
        keyring: this.happKeyring,
        fetcher: this.fetcher,
        maxConfigs: input.limit ?? DEFAULT_IMPORT_LIMIT,
      });
    } catch (err) {
      throw toValidationError(err);
    }

    const imported: AdminVpnServer[] = [];
    for (const proxy of resolved.configs) {
      const country = inferCountry(proxy.tag) ?? input.country ?? 'XX';
      const configBlob = buildSingBoxConfigJson(proxy, { stack: input.stack });
      const server = await this.servers.create({
        providerId: provider.id,
        country,
        name: proxy.tag.slice(0, 64) || `${proxy.server}:${proxy.port}`,
        host: proxy.server,
        configBlob,
      });
      imported.push(toServer(server));
    }

    await this.audit.record({
      adminId,
      action: 'vpn.import',
      targetType: 'vpn_provider',
      targetId: provider.id,
    });
    return { sourceKind: resolved.sourceKind, imported, total: imported.length };
  }

  /**
   * Measures TCP latency to every enabled server (backend-side, §6) and updates
   * pingMs/status/recentFailures. The phone just re-reads /api/vpn/servers.
   */
  async pingAll(adminId: number): Promise<AdminVpnPingResult> {
    const results: AdminVpnPingEntry[] = await this.health.pingAll();
    await this.audit.record({
      adminId,
      action: 'vpn.ping',
      targetType: 'vpn_provider',
      targetId: 'all',
    });
    return { checked: results.length, results };
  }

  async toggleServer(adminId: number, id: string, enabled: boolean): Promise<void> {
    const server = await this.servers.findById(id);
    if (!server) throw new NotFoundError('Server not found');
    await this.servers.setEnabled(id, enabled);
    await this.audit.record({
      adminId,
      action: enabled ? 'vpn.server.enable' : 'vpn.server.disable',
      targetType: 'vpn_server',
      targetId: id,
    });
  }

  async deleteServer(adminId: number, id: string): Promise<void> {
    const server = await this.servers.findById(id);
    if (!server) throw new NotFoundError('Server not found');
    await this.servers.delete(id);
    await this.audit.record({
      adminId,
      action: 'vpn.server.delete',
      targetType: 'vpn_server',
      targetId: id,
    });
  }

  private toProvider(p: VpnProviderRow, serverCount: number): AdminVpnProvider {
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      priority: p.priority,
      enabled: p.enabled,
      serverCount,
      lastSyncAt: p.lastSyncAt ? p.lastSyncAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
    };
  }
}

/**
 * Best-effort ISO-3166 alpha-2 from a server label: a flag emoji (two regional
 * indicator symbols) or a standalone 2-letter code. Null if neither is present.
 */
function inferCountry(tag: string): string | null {
  const chars = [...tag];
  for (let i = 0; i < chars.length - 1; i++) {
    const a = chars[i]!.codePointAt(0)!;
    const b = chars[i + 1]!.codePointAt(0)!;
    if (a >= 0x1f1e6 && a <= 0x1f1ff && b >= 0x1f1e6 && b <= 0x1f1ff) {
      return String.fromCharCode(65 + (a - 0x1f1e6)) + String.fromCharCode(65 + (b - 0x1f1e6));
    }
  }
  const code = tag.match(/\b([A-Za-z]{2})\b/);
  return code ? code[1]!.toUpperCase() : null;
}

/** Maps decode/fetch failures to a 400 with an operator-friendly message. */
function toValidationError(err: unknown): ValidationError {
  if (err instanceof HappDecodeError) {
    const hint =
      err.code === 'no_key'
        ? ' — set HAPP_PRIVATE_KEY_CRYPT4 (see scripts/fetch-happ-key.mjs)'
        : err.code === 'unsupported_version'
          ? ' — only crypt…crypt4 are supported'
          : '';
    return new ValidationError(`Happ link could not be decoded: ${err.message}${hint}`);
  }
  if (err instanceof SubscriptionError) {
    return new ValidationError(`Subscription could not be resolved: ${err.message}`);
  }
  if (err instanceof ValidationError) return err;
  return new ValidationError('Import source could not be processed');
}
