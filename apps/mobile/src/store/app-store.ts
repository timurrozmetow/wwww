import { create } from 'zustand';
import type { Language } from '@vpn/types';

interface HydrationPayload {
  language: Language | null;
  deviceId: string | null;
  onboarded: boolean;
  /** User-chosen data/battery saver; can also be forced on by remote config. */
  lowEndMode: boolean;
}

interface AppState extends HydrationPayload {
  /** True once persisted state has been loaded from storage. */
  hydrated: boolean;
  applyHydration: (payload: HydrationPayload) => void;
  setLanguage: (language: Language) => void;
  setDeviceId: (deviceId: string) => void;
  setOnboarded: () => void;
  setLowEndMode: (lowEndMode: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  hydrated: false,
  language: null,
  deviceId: null,
  onboarded: false,
  lowEndMode: false,
  applyHydration: (payload) => set({ ...payload, hydrated: true }),
  setLanguage: (language) => set({ language }),
  setDeviceId: (deviceId) => set({ deviceId }),
  setOnboarded: () => set({ onboarded: true }),
  setLowEndMode: (lowEndMode) => set({ lowEndMode }),
}));
