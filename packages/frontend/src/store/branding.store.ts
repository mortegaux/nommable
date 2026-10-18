import { create } from 'zustand';
import api from '@/services/api';
import {
  applyBranding,
  type BrandingData,
} from '@/features/settings/branding';

interface BrandingState {
  branding: BrandingData | null;
  loaded: boolean;
  loadBranding: () => Promise<void>;
  refreshBranding: () => Promise<void>;
  updateBranding: (input: {
    appName?: string | null;
    accentColor?: string | null;
  }) => Promise<BrandingData>;
  uploadLogo: (file: File) => Promise<BrandingData>;
  removeLogo: () => Promise<BrandingData>;
  uploadFavicon: (file: File) => Promise<BrandingData>;
  removeFavicon: () => Promise<BrandingData>;
  resetBranding: () => Promise<BrandingData>;
}

let inFlight: Promise<void> | null = null;

function applyAndSet(branding: BrandingData, set: (s: Partial<BrandingState>) => void) {
  applyBranding(branding);
  set({ branding, loaded: true });
}

export const useBrandingStore = create<BrandingState>((set, get) => ({
  branding: null,
  loaded: false,

  loadBranding: () => {
    if (get().loaded) return Promise.resolve();
    if (inFlight) return inFlight;
    // Native fetch, NOT the axios instance: this endpoint is public (the
    // login page needs branding without a session), and the axios 401
    // interceptor would redirect to /login on any failure.
    inFlight = fetch('/api/settings/branding')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Branding fetch failed: ${res.status}`);
        const branding = (await res.json()) as BrandingData;
        applyAndSet(branding, set);
      })
      .catch(() => {
        // Branding is cosmetic: a failed load must never block the app.
        // Explicitly apply the stock defaults (clears any stale accent).
        applyBranding(null);
        set({ branding: null, loaded: true });
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },

  refreshBranding: async () => {
    const res = await fetch('/api/settings/branding');
    if (!res.ok) throw new Error(`Branding fetch failed: ${res.status}`);
    const branding = (await res.json()) as BrandingData;
    applyAndSet(branding, set);
  },

  updateBranding: async (input) => {
    const res = await api.put<BrandingData>('/settings/branding', input);
    applyAndSet(res.data, set);
    return res.data;
  },

  uploadLogo: async (file) => {
    const form = new FormData();
    form.append('logo', file);
    const res = await api.post<BrandingData>('/settings/branding/logo', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    applyAndSet(res.data, set);
    return res.data;
  },

  removeLogo: async () => {
    const res = await api.delete<BrandingData>('/settings/branding/logo');
    applyAndSet(res.data, set);
    return res.data;
  },

  uploadFavicon: async (file) => {
    const form = new FormData();
    form.append('favicon', file);
    const res = await api.post<BrandingData>('/settings/branding/favicon', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    applyAndSet(res.data, set);
    return res.data;
  },

  removeFavicon: async () => {
    const res = await api.delete<BrandingData>('/settings/branding/favicon');
    applyAndSet(res.data, set);
    return res.data;
  },

  resetBranding: async () => {
    const res = await api.post<BrandingData>('/settings/branding/reset');
    applyAndSet(res.data, set);
    return res.data;
  },
}));
