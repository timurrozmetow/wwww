import type {
  AdminAdProvider,
  AdminAdProviderUpdate,
  AdminBanner,
  AdminBannerCreate,
  AdminLoginResponse,
  AdminPushCampaign,
  AdminPushCampaignCreate,
  AdminVpnProvider,
  AdminVpnProviderCreate,
  AdminVpnServer,
  AdminVpnServerCreate,
  AuditLogEntry,
  DashboardStats,
  DeviceDetail,
  DeviceListItem,
  EconomyInputs,
  EconomyOverview,
  EconomyResult,
  EmergencyLogEntry,
  FraudEventView,
  Paginated,
  RemoteConfigItem,
  RemoteConfigSetRequest,
} from '@vpn/types';
import { apiFetch } from './client';

export const adminApi = {
  login: (email: string, password: string): Promise<AdminLoginResponse> =>
    apiFetch('/api/admin/login', { method: 'POST', body: { email, password } }),

  dashboard: (): Promise<DashboardStats> => apiFetch('/api/admin/dashboard'),

  devices: (page: number, pageSize: number): Promise<Paginated<DeviceListItem>> =>
    apiFetch(`/api/admin/devices?page=${page}&pageSize=${pageSize}`),

  device: (id: string): Promise<DeviceDetail> => apiFetch(`/api/admin/devices/${id}`),

  block: (id: string): Promise<{ ok: boolean }> =>
    apiFetch(`/api/admin/devices/${id}/block`, { method: 'POST' }),

  unblock: (id: string): Promise<{ ok: boolean }> =>
    apiFetch(`/api/admin/devices/${id}/unblock`, { method: 'POST' }),

  logs: (): Promise<AuditLogEntry[]> => apiFetch('/api/admin/logs'),

  economyOverview: (): Promise<EconomyOverview> => apiFetch('/api/admin/economy/overview'),

  economyCalculate: (inputs: EconomyInputs): Promise<EconomyResult> =>
    apiFetch('/api/admin/economy/calculate', { method: 'POST', body: inputs }),

  vpnProviders: (): Promise<AdminVpnProvider[]> => apiFetch('/api/admin/vpn/providers'),

  createVpnProvider: (body: AdminVpnProviderCreate): Promise<AdminVpnProvider> =>
    apiFetch('/api/admin/vpn/providers', { method: 'POST', body }),

  toggleVpnProvider: (id: string, enabled: boolean): Promise<{ ok: boolean }> =>
    apiFetch(`/api/admin/vpn/providers/${id}/toggle`, { method: 'POST', body: { enabled } }),

  vpnServers: (): Promise<AdminVpnServer[]> => apiFetch('/api/admin/vpn/servers'),

  createVpnServer: (body: AdminVpnServerCreate): Promise<AdminVpnServer> =>
    apiFetch('/api/admin/vpn/servers', { method: 'POST', body }),

  toggleVpnServer: (id: string, enabled: boolean): Promise<{ ok: boolean }> =>
    apiFetch(`/api/admin/vpn/servers/${id}/toggle`, { method: 'POST', body: { enabled } }),

  deleteVpnServer: (id: string): Promise<{ ok: boolean }> =>
    apiFetch(`/api/admin/vpn/servers/${id}`, { method: 'DELETE' }),

  remoteConfig: (): Promise<RemoteConfigItem[]> => apiFetch('/api/admin/remote-config'),

  setRemoteConfig: (body: RemoteConfigSetRequest): Promise<{ ok: boolean }> =>
    apiFetch('/api/admin/remote-config', { method: 'PUT', body }),

  emergencyLogs: (): Promise<EmergencyLogEntry[]> => apiFetch('/api/admin/emergency/logs'),

  fraudEvents: (): Promise<FraudEventView[]> => apiFetch('/api/admin/fraud/events'),

  pushCampaigns: (): Promise<AdminPushCampaign[]> => apiFetch('/api/admin/push/campaigns'),

  createPushCampaign: (body: AdminPushCampaignCreate): Promise<AdminPushCampaign> =>
    apiFetch('/api/admin/push/campaigns', { method: 'POST', body }),

  sendPushCampaign: (id: number): Promise<AdminPushCampaign> =>
    apiFetch(`/api/admin/push/campaigns/${id}/send`, { method: 'POST' }),

  adProviders: (): Promise<AdminAdProvider[]> => apiFetch('/api/admin/ads/providers'),

  updateAdProvider: (id: number, body: AdminAdProviderUpdate): Promise<AdminAdProvider> =>
    apiFetch(`/api/admin/ads/providers/${id}`, { method: 'PATCH', body }),

  toggleAdProvider: (id: number, enabled: boolean): Promise<{ ok: boolean }> =>
    apiFetch(`/api/admin/ads/providers/${id}/toggle`, { method: 'POST', body: { enabled } }),

  banners: (): Promise<AdminBanner[]> => apiFetch('/api/admin/banners'),

  createBanner: (body: AdminBannerCreate): Promise<AdminBanner> =>
    apiFetch('/api/admin/banners', { method: 'POST', body }),

  toggleBanner: (id: number, enabled: boolean): Promise<{ ok: boolean }> =>
    apiFetch(`/api/admin/banners/${id}/toggle`, { method: 'POST', body: { enabled } }),

  deleteBanner: (id: number): Promise<{ ok: boolean }> =>
    apiFetch(`/api/admin/banners/${id}`, { method: 'DELETE' }),
};
