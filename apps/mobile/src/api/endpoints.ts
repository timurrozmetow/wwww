import type {
  AdSessionStartResponse,
  AdsConfig,
  AdWaterfallConfig,
  AppConfig,
  BalanceResponse,
  BannerView,
  DeviceRegisterRequest,
  DeviceRegisterResponse,
  HeartbeatResponse,
  VpnServerView,
} from '@vpn/types';
import { apiFetch } from './client';

export function registerDevice(body: DeviceRegisterRequest): Promise<DeviceRegisterResponse> {
  return apiFetch('/api/device/register', { method: 'POST', body });
}

export function heartbeat(deviceId: string, appVersion?: string): Promise<HeartbeatResponse> {
  return apiFetch('/api/device/heartbeat', {
    method: 'POST',
    deviceId,
    body: { appVersion },
  });
}

export function fetchAppConfig(): Promise<AppConfig> {
  return apiFetch('/api/app/config');
}

export function fetchBalance(deviceId: string): Promise<BalanceResponse> {
  return apiFetch('/api/rewards/balance', { deviceId });
}

export function fetchAdsConfig(): Promise<AdsConfig> {
  return apiFetch('/api/ads/config');
}

/** Backend-driven mediation waterfall (enabled providers, in priority order). */
export function fetchWaterfallConfig(): Promise<AdWaterfallConfig> {
  return apiFetch('/api/ads/waterfall-config');
}

/** Opens an ad-watch attempt; the returned sessionId is the SSV custom data. */
export function startAdSession(deviceId: string): Promise<AdSessionStartResponse> {
  return apiFetch('/api/ads/session/start', { method: 'POST', deviceId });
}

/** Public, safe server catalog — country/flag/name/ping/quality only (§7.2). */
export function fetchServers(): Promise<VpnServerView[]> {
  return apiFetch('/api/vpn/servers');
}

/** Active in-app banners targeted to this device (language/segment/date). */
export function fetchBanners(deviceId: string): Promise<BannerView[]> {
  return apiFetch('/api/notifications/in-app', { deviceId });
}

/** Registers / refreshes this device's FCM push token (idempotent on the token). */
export function registerPushToken(deviceId: string, token: string): Promise<{ ok: boolean }> {
  return apiFetch('/api/notifications/push-token', {
    method: 'POST',
    deviceId,
    body: { token },
  });
}
