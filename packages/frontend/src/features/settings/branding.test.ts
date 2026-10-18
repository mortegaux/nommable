import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  hexToHsl,
  contrastRatio,
  isContrastSafeAccent,
  pickAccentForeground,
  deriveDarkPrimary,
  buildAccentCss,
  applyAccent,
  applyFavicon,
  applyDocumentTitle,
  ACCENT_PALETTE,
} from '@/features/settings/branding';

describe('branding utils', () => {
  describe('hexToHsl', () => {
    it('converts primary colors', () => {
      expect(hexToHsl('#FF0000')).toEqual({ h: 0, s: 100, l: 50 });
      expect(hexToHsl('#00FF00')).toEqual({ h: 120, s: 100, l: 50 });
      expect(hexToHsl('#0000FF')).toEqual({ h: 240, s: 100, l: 50 });
    });

    it('converts the stock-adjacent terracotta', () => {
      const { h, s, l } = hexToHsl('#C2410C');
      expect(h).toBeGreaterThanOrEqual(14);
      expect(h).toBeLessThanOrEqual(20);
      expect(s).toBeGreaterThan(80);
      expect(l).toBeGreaterThan(30);
      expect(l).toBeLessThan(50);
    });

    it('handles grays (zero saturation)', () => {
      expect(hexToHsl('#808080')).toEqual({ h: 0, s: 0, l: 50 });
    });
  });

  describe('contrast', () => {
    it('black vs white is 21:1', () => {
      expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    });

    it('is symmetric', () => {
      expect(contrastRatio('#C2410C', '#FFFFFF')).toBeCloseTo(
        contrastRatio('#FFFFFF', '#C2410C'),
        6
      );
    });

    it('every curated palette color passes the AA gate against white', () => {
      for (const hex of ACCENT_PALETTE) {
        expect(contrastRatio(hex, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
        expect(isContrastSafeAccent(hex)).toBe(true);
      }
    });

    it('rejects pastels that would make primary text unreadable', () => {
      expect(isContrastSafeAccent('#FEF08A')).toBe(false); // very light yellow
      expect(isContrastSafeAccent('#FBCFE8')).toBe(false); // light pink
    });

    it('rejects malformed values', () => {
      expect(isContrastSafeAccent('red')).toBe(false);
      expect(isContrastSafeAccent('#12345')).toBe(false);
      expect(isContrastSafeAccent('#GGGGGG')).toBe(false);
    });
  });

  describe('foreground + dark derivation', () => {
    it('picks white foreground for dark accents, black for light ones', () => {
      expect(pickAccentForeground('#C2410C')).toBe('0 0% 100%');
      expect(pickAccentForeground('#FDE68A')).toBe('0 0% 0%');
    });

    it('derives a lightened dark-mode primary (lightness 72, same hue/sat)', () => {
      const dark = deriveDarkPrimary('#C2410C');
      const base = hexToHsl('#C2410C');
      expect(dark.h).toBe(base.h);
      expect(dark.s).toBe(base.s);
      expect(dark.l).toBe(72);
    });
  });

  describe('buildAccentCss', () => {
    it('emits light + dark overrides with matching ring', () => {
      const css = buildAccentCss('#C2410C');
      expect(css).toContain('html:not(.dark)');
      expect(css).toContain('html.dark');
      expect(css).toContain('--primary:');
      expect(css).toContain('--primary-foreground: 0 0% 100%');
      expect(css).toContain('--ring:');
      // Dark rule uses the lightened derivation, not the raw accent.
      const darkRule = css.split('html.dark')[1];
      expect(darkRule).toContain('72%');
      expect(darkRule).toContain('--primary-foreground: 222.2 47.4% 11.2%');
    });
  });

  describe('applyAccent', () => {
    afterEach(() => {
      document.getElementById('branding-accent')?.remove();
    });

    it('injects a style tag and removes it on null', () => {
      applyAccent('#C2410C');
      const tag = document.getElementById('branding-accent');
      expect(tag).not.toBeNull();
      expect(tag?.textContent).toContain('--primary:');
      applyAccent(null);
      expect(document.getElementById('branding-accent')).toBeNull();
    });

    it('updates the same tag on re-apply (no duplicates)', () => {
      applyAccent('#C2410C');
      applyAccent('#166534');
      expect(document.querySelectorAll('#branding-accent').length).toBe(1);
      // #166534 in HSL is 143 64% 24% — the tag holds HSL triplets, not hex.
      expect(document.getElementById('branding-accent')?.textContent).toContain('143 64% 24%');
    });
  });

  describe('applyFavicon', () => {
    beforeEach(() => {
      document.head.querySelectorAll('link[rel="icon"]').forEach((el) => el.remove());
      const link = document.createElement('link');
      link.setAttribute('rel', 'icon');
      link.setAttribute('href', '/favicon-32x32.png');
      document.head.appendChild(link);
    });

    it('swaps the favicon href and restores the stock one on null', () => {
      applyFavicon('/uploads/branding/favicon-1.png');
      expect(
        document.querySelector('link[rel="icon"]')?.getAttribute('href')
      ).toBe('/uploads/branding/favicon-1.png');
      applyFavicon(null);
      expect(
        document.querySelector('link[rel="icon"]')?.getAttribute('href')
      ).toBe('/favicon-32x32.png');
    });
  });

  describe('applyDocumentTitle', () => {
    afterEach(() => {
      document.title = '';
    });

    it('uses the custom name, falling back to Nommable', () => {
      applyDocumentTitle('My Kitchen');
      expect(document.title).toBe('My Kitchen - Recipe Management');
      applyDocumentTitle(null);
      expect(document.title).toBe('Nommable - Recipe Management');
    });
  });
});
