import type {
  AdminVpnProvider,
  AdminVpnProviderCreate,
  AdminVpnServer,
  AdminVpnServerCreate,
} from '@vpn/types';
import { NotFoundError } from '../../lib/errors.js';
import type { VpnProviderRepository, VpnProviderRow } from '../vpn/vpn-provider.repository.js';
import type { VpnServerRepository, VpnServerRow } from '../vpn/vpn-server.repository.js';
import type { AuditLogRepository } from './admin.repository.js';

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
