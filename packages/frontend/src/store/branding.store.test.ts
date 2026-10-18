import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBrandingStore } from '@/store/branding.store';
import type { BrandingData } from '@/features/settings/branding';

const customBranding: BrandingData = {
  appName: 'My Kitchen',
  logoUrl: '/uploads/branding/logo-1.png',
  accentColor: '#C2410C',
  faviconUrl: '/uploads/branding/favicon-1.png',
};

describe('branding.store', () => {
  beforeEach(() => {
    useBrandingStore.setState({ branding: null, loaded: false });
    document.title = '';
    document.getElementById('branding-accent')?.remove();
    document.head.querySelectorAll('link[rel="icon"]').forEach((el) => el.remove());
    const link = document.createElement('link');
    link.setAttribute('rel', 'icon');
    link.setAttribute('href', '/favicon-32x32.png');
    document.head.appendChild(link);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads branding once and applies title, accent, and favicon', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => customBranding,
    });
    vi.stubGlobal('fetch', fetchMock);

    await useBrandingStore.getState().loadBranding();
    expect(useBrandingStore.getState().branding).toEqual(customBranding);
    expect(document.title).toBe('My Kitchen - Recipe Management');
    expect(document.getElementById('branding-accent')?.textContent).toContain('--primary:');
    expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe(
      '/uploads/branding/favicon-1.png'
    );

    // Second load is a no-op (loaded guard) — no second fetch.
    await useBrandingStore.getState().loadBranding();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to defaults when the fetch fails (never blocks the app)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await useBrandingStore.getState().loadBranding();
    expect(useBrandingStore.getState().branding).toBeNull();
    expect(useBrandingStore.getState().loaded).toBe(true);
    expect(document.title).toBe('Nommable - Recipe Management');
    expect(document.getElementById('branding-accent')).toBeNull();
  });
});
