/**
 * Branding helpers (issue #55): accent-color math + DOM application.
 *
 * The accent is applied as a CSS-variable override via an injected
 * `<style id="branding-accent">` tag — never by editing the token files —
 * so resetting is just removing the tag. Selectors are `html:not(.dark)` /
 * `html.dark` so they beat the `:root` / `.dark` token rules on
 * specificity in both themes.
 */

export interface BrandingData {
  appName: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  faviconUrl: string | null;
}

export const DEFAULT_APP_NAME = 'Nommable';
export const DEFAULT_LOGO_URL = '/logo.png';
export const MAX_APP_NAME_LENGTH = 100;
export const MAX_BRANDING_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB, same as the backend

/** Curated accent palette — mirrors the backend palette. */
export const ACCENT_PALETTE = [
  '#C2410C',
  '#B91C1C',
  '#166534',
  '#1D4ED8',
  '#6D28D9',
  '#9D174D',
  '#854D0E',
  '#0F766E',
] as const;

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const [lighter, darker] = lumA >= lumB ? [lumA, lumB] : [lumB, lumA];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Same gate as the backend: primary text in the accent must stay readable
 * against the white light-mode background at WCAG AA (4.5:1).
 */
export function isContrastSafeAccent(hex: string): boolean {
  return isValidHexColor(hex) && contrastRatio(hex, '#FFFFFF') >= 4.5;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Button/foreground color for an accent: white or black, whichever contrasts better (>= 4.5 always). */
export function pickAccentForeground(hex: string): string {
  return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, '#000000')
    ? '0 0% 100%'
    : '0 0% 0%';
}

/**
 * Dark-mode primary derivation: keep the accent's hue/saturation, raise
 * lightness to 72%. Dark-mode primary buttons are light-on-dark by design
 * (stock dark `--primary` is near-white), so a lightened accent preserves
 * that language while tinting it with the brand hue — and it contrasts
 * strongly against both the dark background and the dark foreground.
 */
export function deriveDarkPrimary(hex: string): Hsl {
  const { h, s } = hexToHsl(hex);
  return { h, s, l: 72 };
}

export function buildAccentCss(accentHex: string): string {
  const { h, s, l } = hexToHsl(accentHex);
  const fg = pickAccentForeground(accentHex);
  const dark = deriveDarkPrimary(accentHex);
  return [
    `html:not(.dark) { --primary: ${h} ${s}% ${l}%; --primary-foreground: ${fg}; --ring: ${h} ${s}% ${l}%; }`,
    `html.dark { --primary: ${dark.h} ${dark.s}% ${dark.l}%; --primary-foreground: 222.2 47.4% 11.2%; --ring: ${dark.h} ${dark.s}% ${dark.l}%; }`,
  ].join('\n');
}

const ACCENT_STYLE_ID = 'branding-accent';

/** Apply (or clear, when null) the accent override. */
export function applyAccent(accentHex: string | null): void {
  const existing = document.getElementById(ACCENT_STYLE_ID);
  if (!accentHex) {
    existing?.remove();
    return;
  }
  let style = existing;
  if (!style) {
    style = document.createElement('style');
    style.id = ACCENT_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = buildAccentCss(accentHex);
}

const FAVICON_ORIGINAL_KEY = 'data-branding-original-href';

/** Point every favicon link at the custom favicon, or restore the stock ones. */
export function applyFavicon(faviconUrl: string | null): void {
  const links = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="icon"], link[rel="apple-touch-icon"]'
  );
  links.forEach((link) => {
    if (!link.getAttribute(FAVICON_ORIGINAL_KEY)) {
      link.setAttribute(FAVICON_ORIGINAL_KEY, link.getAttribute('href') ?? '');
    }
    if (faviconUrl) {
      link.setAttribute('href', faviconUrl);
    } else {
      link.setAttribute('href', link.getAttribute(FAVICON_ORIGINAL_KEY) ?? '');
    }
  });
}

export function applyDocumentTitle(appName: string | null): void {
  document.title = `${appName ?? DEFAULT_APP_NAME} - Recipe Management`;
}

/** Apply a full branding payload to the document (accent + favicon + title). */
export function applyBranding(branding: BrandingData | null): void {
  applyAccent(branding?.accentColor ?? null);
  applyFavicon(branding?.faviconUrl ?? null);
  applyDocumentTitle(branding?.appName ?? null);
}
