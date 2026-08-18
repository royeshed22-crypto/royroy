import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { authApi, usersApi } from '@/lib/api';
import { User } from '@/lib/types';

interface AuthState {
  token: string | null;
  user: User | null;
  deviceId: string;
  onboardingComplete: boolean;
  isLoading: boolean;

  initSession: () => Promise<void>;
  fetchUser: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
  setOnboardingComplete: (v: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      deviceId: uuidv4(),
      onboardingComplete: false,
      isLoading: false,

      initSession: async () => {
        if (get().token) return;
        set({ isLoading: true });
        try {
          const result = await authApi.createSession(get().deviceId);
          if (typeof window !== 'undefined') {
            localStorage.setItem('dugrizz_token', result.token);
          }
          set({ token: result.token });
          await get().fetchUser();
        } finally {
          set({ isLoading: false });
        }
      },

      fetchUser: async () => {
        try {
          const user = await usersApi.getMe();
          set({ user });
        } catch {
          // silent
        }
      },

      updateUser: async (data) => {
        const user = await usersApi.updateMe(data);
        set({ user });
        return user;
      },

      setOnboardingComplete: (v) => set({ onboardingComplete: v }),

      reset: () => {
        if (typeof window !== 'undefined') localStorage.removeItem('dugrizz_token');
        set({ token: null, user: null, onboardingComplete: false });
      },
    }),
    {
      name: 'dugrizz-auth',
      partialize: (s) => ({ token: s.token, deviceId: s.deviceId, onboardingComplete: s.onboardingComplete }),
      onRehydrateStorage: () => (state) => {
        if (state?.token && typeof window !== 'undefined') {
          localStorage.setItem('dugrizz_token', state.token);
        }
      },
    },
  ),
);
