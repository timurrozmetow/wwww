import { create } from 'zustand';
import type { Language } from '@vpn/types';

interface HydrationPayload {
  language: Language;
  deviceId: string | null;
  /** Persisted choice; null = "auto" (recommended server). */
  selectedServerId: string | null;
  /** User-chosen data/battery saver; can also be forced on by remote config. */
  lowEndMode: boolean;
}

interface AppState extends HydrationPayload {
  /** True once persisted state has been loaded from storage. */
  hydrated: boolean;
  applyHydration: (payload: HydrationPayload) => void;
  setLanguage: (language: Language) => void;
  setDeviceId: (deviceId: string) => void;
  setSelectedServerId: (serverId: string | null) => void;
  setLowEndMode: (lowEndMode: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  hydrated: false,
  language: 'ru',
  deviceId: null,
  selectedServerId: null,
  lowEndMode: false,
  applyHydration: (payload) => set({ ...payload, hydrated: true }),
  setLanguage: (language) => set({ language }),
  setDeviceId: (deviceId) => set({ deviceId }),
  setSelectedServerId: (selectedServerId) => set({ selectedServerId }),
  setLowEndMode: (lowEndMode) => set({ lowEndMode }),
}));
