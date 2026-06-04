import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeviceRegisterRequest, VpnServerView } from '@vpn/types';
import {
  fetchAppConfig,
  fetchBalance,
  fetchBanners,
  fetchServers,
  recheckServers,
  registerDevice,
} from '../api/endpoints';
import { useAppStore } from '../store/app-store';

export function useRegisterDevice() {
  return useMutation({
    mutationFn: (body: DeviceRegisterRequest) => registerDevice(body),
  });
}

export function useAppConfig() {
  return useQuery({
    queryKey: ['app-config'],
    queryFn: fetchAppConfig,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Effective data-saver state: the user's toggle OR a remote-config force
 * (`featureFlags.lowEndMode`), so support can switch a whole segment to the
 * lighter path without an app release (CLAUDE.md §6).
 */
export function useLowEndMode(): boolean {
  const userPref = useAppStore((s) => s.lowEndMode);
  const config = useAppConfig();
  const serverForced = config.data?.featureFlags?.lowEndMode ?? false;
  return userPref || serverForced;
}

export function useBalance(deviceId: string | null) {
  const lowEnd = useLowEndMode();
  return useQuery({
    queryKey: ['balance', deviceId],
    queryFn: () => fetchBalance(deviceId as string),
    enabled: deviceId !== null,
    // Refetch less aggressively on low-end / metered connections to save data.
    staleTime: lowEnd ? 5 * 60 * 1000 : 30 * 1000,
  });
}

export function useBanners(deviceId: string | null) {
  const lowEnd = useLowEndMode();
  return useQuery({
    queryKey: ['banners', deviceId],
    queryFn: () => fetchBanners(deviceId as string),
    enabled: deviceId !== null,
    staleTime: lowEnd ? 30 * 60 * 1000 : 5 * 60 * 1000,
  });
}

/** Server catalog (cached; backend computes ping/quality — phone never pings). */
export function useServers() {
  const lowEnd = useLowEndMode();
  return useQuery({
    queryKey: ['vpn-servers'],
    queryFn: fetchServers,
    staleTime: lowEnd ? 30 * 60 * 1000 : 5 * 60 * 1000,
  });
}

/** "Check ping": asks the backend to re-measure, then updates the cached catalog. */
export function useRecheckServers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: recheckServers,
    onSuccess: (servers: VpnServerView[]) => qc.setQueryData(['vpn-servers'], servers),
  });
}
