import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AdminProfile } from '@vpn/types';

interface AuthState {
  token: string | null;
  admin: AdminProfile | null;
  setAuth: (token: string, admin: AdminProfile) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      admin: null,
      setAuth: (token, admin) => set({ token, admin }),
      logout: () => set({ token: null, admin: null }),
    }),
    { name: 'vpn-admin-auth' },
  ),
);
