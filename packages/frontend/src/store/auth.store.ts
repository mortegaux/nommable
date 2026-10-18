import { create } from 'zustand';
import { authApi, setupApi } from '@/services/api';
import type { User } from '@nommable/shared';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  needsSetup: boolean;
  /** Non-null when the last auth check failed transiently (429 / 5xx / network).
   *  The session is KEPT in this state — it means "couldn't reach the server",
   *  not "logged out" (issue #70). */
  authError: 'transient' | null;
  login: (username: string, password: string) => Promise<void>;
  registerWithInvite: (token: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User) => void;
  setAuthFromSetup: (user: User, token: string) => void;
}

/** Delay before the single retry after a transient auth-check failure. */
const TRANSIENT_RETRY_DELAY_MS = 2000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isLoading: true,
  needsSetup: false,
  authError: null,

  login: async (username, password) => {
    const response = await authApi.login({ username, password });
    const { token, user } = response.data;
    localStorage.setItem('token', token);
    set({ user, token, needsSetup: false, authError: null });
  },

  registerWithInvite: async (token, username, password) => {
    const response = await authApi.registerWithInvite({ token, username, password });
    const { token: authToken, user } = response.data;
    localStorage.setItem('token', authToken);
    set({ user, token: authToken, needsSetup: false, authError: null });
  },

  logout: async () => {
    const token = localStorage.getItem('token');
    // Tell the backend to revoke the session (best effort)
    if (token) {
      try {
        await authApi.logout();
      } catch {
        // Session may already be invalid — still clear local state
      }
    }
    localStorage.removeItem('token');
    set({ user: null, token: null, authError: null });
  },

  checkAuth: async () => {
    try {
      const setupRes = await setupApi.getStatus();
      if (setupRes.data.needsSetup) {
        localStorage.removeItem('token');
        set({ needsSetup: true, user: null, token: null, isLoading: false, authError: null });
        return;
      }
    } catch {
      // If status check fails, proceed with normal auth check
    }

    const token = localStorage.getItem('token');
    if (!token) {
      set({ needsSetup: false, isLoading: false, authError: null });
      return;
    }

    // Only a 401 means "this session is invalid" — clear the token then.
    // A 429 / 5xx / network failure is transient: keep the token (and any
    // existing user), flag it, and retry once after a short delay. Never
    // wipe a valid session because the server was briefly unreachable
    // (issue #70). Note: the axios interceptor already hard-redirects on
    // 401, so reaching the 401 branch here is belt-and-braces.
    const fetchUser = async (): Promise<'ok' | 'invalid' | 'transient'> => {
      try {
        const response = await authApi.me();
        set({ user: response.data, needsSetup: false, isLoading: false, authError: null });
        return 'ok';
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401) {
          localStorage.removeItem('token');
          set({ user: null, token: null, needsSetup: false, isLoading: false, authError: null });
          return 'invalid';
        }
        return 'transient';
      }
    };

    const first = await fetchUser();
    if (first !== 'transient') {
      return;
    }
    set({ needsSetup: false, isLoading: false, authError: 'transient' });
    await delay(TRANSIENT_RETRY_DELAY_MS);
    const second = await fetchUser();
    if (second === 'transient') {
      // Still unreachable: session is preserved, UI shows the transient
      // state (ProtectedRoute) instead of bouncing to /login.
      set({ needsSetup: false, isLoading: false, authError: 'transient' });
    }
  },

  setUser: (user: User) => {
    set({ user });
  },

  setAuthFromSetup: (user: User, token: string) => {
    if (token) {
      localStorage.setItem('token', token);
    }
    set({ user, token, needsSetup: false, isLoading: false, authError: null });
  },
}));
