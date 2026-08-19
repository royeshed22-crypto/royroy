import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { authApi, usersApi, setAuthToken, setUnauthorizedHandler } from '@/lib/api';
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
  clearSession: () => void;
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
            setAuthToken(result.token);
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
          // A 401 here is handled by the interceptor; anything else is transient.
        }
      },

      updateUser: async (data) => {
        const user = await usersApi.updateMe(data);
        set({ user });
        return user;
      },

      setOnboardingComplete: (v) => set({ onboardingComplete: v }),

      /**
       * Drops the credential but keeps deviceId and onboarding progress, so a
       * rejected token results in a quiet re-auth rather than starting over.
       */
      clearSession: () => {
        setAuthToken(null);
        inFlightSession = null;
        set({ token: null, user: null });
      },

      reset: () => {
        setAuthToken(null);
        inFlightSession = null;
        set({ token: null, user: null, onboardingComplete: false });
      },
    }),
    {
      name: 'dugrizz-auth',
      partialize: (s) => ({ token: s.token, deviceId: s.deviceId, onboardingComplete: s.onboardingComplete }),
      onRehydrateStorage: () => (state) => {
        // Hand the restored token to the axios layer before anything can fire
        // a request with no Authorization header.
        setAuthToken(state?.token ?? null);

        // Leftover from when the token lived in two places; nothing reads it now.
        if (typeof window !== 'undefined') localStorage.removeItem('dugrizz_token');

        // Signals that routing guards may now trust `token`. Without this they
        // read the pre-hydration null, bounce to "/", and loop.
        state?.setHydrated();
      },
    },
  ),
);

// A rejected token (usually because the API's JWT secret changed) clears the
// session and immediately mints a new one, in place. No navigation, so this
// cannot become a reload loop.
setUnauthorizedHandler(() => {
  const { token, clearSession, initSession } = useAuthStore.getState();
  if (!token) return;

  clearSession();
  void initSession().catch(() => {});
});
