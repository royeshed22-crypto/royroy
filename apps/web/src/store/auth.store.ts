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
  /** False until persisted state has been read back from localStorage. */
  hydrated: boolean;

  setHydrated: () => void;
  initSession: () => Promise<void>;
  fetchUser: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
  setOnboardingComplete: (v: boolean) => void;
  reset: () => void;
}

/** Shared across callers so a session is only ever created once. */
let inFlightSession: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      deviceId: uuidv4(),
      onboardingComplete: false,
      isLoading: false,
      hydrated: false,

      setHydrated: () => set({ hydrated: true }),

      initSession: async () => {
        // Guard against concurrent callers: two overlapping calls would each
        // mint a session and the second would orphan the first user's data.
        if (get().token || inFlightSession) return inFlightSession ?? undefined;

        inFlightSession = (async () => {
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
            inFlightSession = null;
          }
        })();

        return inFlightSession;
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
        // Signals that routing guards may now trust `token`. Without this they
        // read the pre-hydration null, bounce to "/", and loop.
        state?.setHydrated();
      },
    },
  ),
);
