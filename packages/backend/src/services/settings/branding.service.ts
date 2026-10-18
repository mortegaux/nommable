import fs from 'fs';
import path from 'path';
import { AppDataSource } from '../../db/data-source';
import { config } from '../../config';
import { AppError } from '../../api/middleware';

export interface BrandingData {
  /** Displayed app name. null = stock "Nommable". */
  appName: string | null;
  /** Public URL of the custom header logo. null = stock /logo.png. */
  logoUrl: string | null;
  /** Accent color as "#RRGGBB". null = stock primary token. */
  accentColor: string | null;
  /** Public URL of the custom favicon. null = stock favicons. */
  faviconUrl: string | null;
}

export const DEFAULT_APP_NAME = 'Nommable';
export const DEFAULT_LOGO_URL = '/logo.png';
export const MAX_APP_NAME_LENGTH = 100;
export const BRANDING_UPLOAD_SUBDIR = 'branding';

/**
 * Curated accent palette. Every entry is verified contrast-safe:
 * contrast against white is >= 4.5:1 (so `text-primary` stays AA-readable
 * in light mode) and white button text on it is >= 4.5:1.
 */
export const ACCENT_PALETTE = [
  '#C2410C', // Burnt orange (brand-adjacent)
  '#B91C1C', // Red
  '#166534', // Deep green
  '#1D4ED8', // Blue
  '#6D28D9', // Violet
  '#9D174D', // Raspberry
  '#854D0E', // Amber/brown
  '#0F766E', // Teal
] as const;

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const SAFE_FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

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

/** WCAG relative luminance of an "#RRGGBB" color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio between two "#RRGGBB" colors (>= 1, higher = more contrast). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const [lighter, darker] = lumA >= lumB ? [lumA, lumB] : [lumB, lumA];
  return (lighter + 0.05) / (darker + 0.05);
}

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

/**
 * An accent is contrast-safe when primary text in that color stays readable
 * against the white light-mode background at WCAG AA (4.5:1). Button text is
 * always satisfiable: the frontend picks white or black foreground, whichever
 * contrasts better (max of the two is >= 4.5 for every color). Dark mode is
 * safe by construction: the frontend derives a lightened variant
 * (lightness 72%) for the dark primary token, which contrasts strongly
 * against both the dark background and the dark foreground.
 */
export function isContrastSafeAccent(hex: string): boolean {
  return contrastRatio(hex, '#FFFFFF') >= 4.5;
}

export function validateAppName(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new AppError(400, 'App name must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new AppError(400, 'App name must not be empty');
  }
  if (trimmed.length > MAX_APP_NAME_LENGTH) {
    throw new AppError(400, `App name must be at most ${MAX_APP_NAME_LENGTH} characters`);
  }
  // No angle brackets or control characters: the name is rendered as text,
  // but never accept anything that could look like markup if it ever leaks
  // into an unescaped context. No custom CSS/HTML is allowed (issue #55).
  if (/[<>\u0000-\u001F\u007F]/.test(trimmed)) {
    throw new AppError(400, 'App name must not contain angle brackets or control characters');
  }
  return trimmed;
}

export function validateAccentColor(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!isValidHexColor(value)) {
    throw new AppError(400, 'Accent color must be a hex color like "#C2410C"');
  }
  const normalized = value.toUpperCase();
  if (!isContrastSafeAccent(normalized)) {
    throw new AppError(
      400,
      'Accent color must have at least 4.5:1 contrast against white so primary text stays readable'
    );
  }
  return normalized;
}

function brandingDir(): string {
  const dir = path.join(config.upload.dir, BRANDING_UPLOAD_SUBDIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function fileUrl(filename: string | null): string | null {
  if (!filename) return null;
  // Defense in depth: only serve plain filenames from the branding dir.
  // A stored value that fails this check is treated as "no custom file"
  // so a broken/missing logo always falls back to the default.
  if (!SAFE_FILENAME_RE.test(filename) || filename.includes('..')) return null;
  return `/uploads/${BRANDING_UPLOAD_SUBDIR}/${filename}`;
}

function deleteStoredFile(filename: string | null): void {
  if (!filename || !SAFE_FILENAME_RE.test(filename) || filename.includes('..')) return;
  try {
    fs.unlinkSync(path.join(brandingDir(), filename));
  } catch {
    // Best effort: the file may already be gone.
  }
}

export class BrandingService {
  private static tableInitialized = false;

  static async initialize(): Promise<void> {
    if (this.tableInitialized || !AppDataSource.isInitialized) return;
    try {
      await AppDataSource.query(`
        CREATE TABLE IF NOT EXISTS "branding_settings" (
          "id" varchar(32) PRIMARY KEY DEFAULT 'default',
          "app_name" varchar(100),
          "logo_path" varchar(512),
          "accent_color" varchar(7),
          "favicon_path" varchar(512),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await AppDataSource.query(`
        INSERT INTO "branding_settings" ("id", "updated_at")
        VALUES ('default', datetime('now'))
        ON CONFLICT ("id") DO NOTHING
      `);
      this.tableInitialized = true;
    } catch (err) {
      console.warn('[BrandingService] Failed to ensure branding_settings table:', err);
    }
  }

  static async getBranding(): Promise<BrandingData> {
    await this.initialize();
    if (AppDataSource.isInitialized) {
      try {
        const rows = await AppDataSource.query(
          `SELECT "app_name", "logo_path", "accent_color", "favicon_path"
           FROM "branding_settings" WHERE "id" = 'default' LIMIT 1`
        );
        if (rows && rows.length > 0) {
          const r = rows[0];
          return {
            appName: typeof r.app_name === 'string' ? r.app_name : null,
            logoUrl: fileUrl(typeof r.logo_path === 'string' ? r.logo_path : null),
            accentColor:
              typeof r.accent_color === 'string' && isValidHexColor(r.accent_color)
                ? r.accent_color
                : null,
            faviconUrl: fileUrl(typeof r.favicon_path === 'string' ? r.favicon_path : null),
          };
        }
      } catch (err) {
        console.warn('[BrandingService] Failed to read branding_settings:', err);
      }
    }
    return { appName: null, logoUrl: null, accentColor: null, faviconUrl: null };
  }

  /** Partial update: only provided fields change; explicit null clears to default. */
  static async updateBranding(input: {
    appName?: string | null;
    accentColor?: string | null;
  }): Promise<BrandingData> {
    await this.initialize();
    const current = await this.getBranding();
    const nextAppName =
      input.appName !== undefined ? validateAppName(input.appName) : current.appName;
    const nextAccent =
      input.accentColor !== undefined ? validateAccentColor(input.accentColor) : current.accentColor;

    if (AppDataSource.isInitialized) {
      await AppDataSource.query(
        `INSERT INTO "branding_settings" ("id", "app_name", "accent_color", "updated_at")
         VALUES ('default', ?, ?, datetime('now'))
         ON CONFLICT ("id") DO UPDATE SET
           "app_name" = EXCLUDED."app_name",
           "accent_color" = EXCLUDED."accent_color",
           "updated_at" = datetime('now')`,
        [nextAppName, nextAccent]
      );
    }
    return this.getBranding();
  }

  static async setLogo(filename: string): Promise<BrandingData> {
    await this.initialize();
    const current = await this.getBranding();
    const oldFilename = current.logoUrl?.split('/').pop() ?? null;
    if (AppDataSource.isInitialized) {
      await AppDataSource.query(
        `INSERT INTO "branding_settings" ("id", "logo_path", "updated_at")
         VALUES ('default', ?, datetime('now'))
         ON CONFLICT ("id") DO UPDATE SET
           "logo_path" = EXCLUDED."logo_path",
           "updated_at" = datetime('now')`,
        [filename]
      );
    }
    deleteStoredFile(oldFilename);
    return this.getBranding();
  }

  static async clearLogo(): Promise<BrandingData> {
    await this.initialize();
    const current = await this.getBranding();
    const oldFilename = current.logoUrl?.split('/').pop() ?? null;
    if (AppDataSource.isInitialized) {
      await AppDataSource.query(
        `UPDATE "branding_settings" SET "logo_path" = NULL, "updated_at" = datetime('now') WHERE "id" = 'default'`
      );
    }
    deleteStoredFile(oldFilename);
    return this.getBranding();
  }

  static async setFavicon(filename: string): Promise<BrandingData> {
    await this.initialize();
    const current = await this.getBranding();
    const oldFilename = current.faviconUrl?.split('/').pop() ?? null;
    if (AppDataSource.isInitialized) {
      await AppDataSource.query(
        `INSERT INTO "branding_settings" ("id", "favicon_path", "updated_at")
         VALUES ('default', ?, datetime('now'))
         ON CONFLICT ("id") DO UPDATE SET
           "favicon_path" = EXCLUDED."favicon_path",
           "updated_at" = datetime('now')`,
        [filename]
      );
    }
    deleteStoredFile(oldFilename);
    return this.getBranding();
  }

  static async clearFavicon(): Promise<BrandingData> {
    await this.initialize();
    const current = await this.getBranding();
    const oldFilename = current.faviconUrl?.split('/').pop() ?? null;
    if (AppDataSource.isInitialized) {
      await AppDataSource.query(
        `UPDATE "branding_settings" SET "favicon_path" = NULL, "updated_at" = datetime('now') WHERE "id" = 'default'`
      );
    }
    deleteStoredFile(oldFilename);
    return this.getBranding();
  }

  /** Reset to stock branding: deletes custom files and clears every field. */
  static async resetBranding(): Promise<BrandingData> {
    await this.initialize();
    const current = await this.getBranding();
    const logoFilename = current.logoUrl?.split('/').pop() ?? null;
    const faviconFilename = current.faviconUrl?.split('/').pop() ?? null;
    if (AppDataSource.isInitialized) {
      await AppDataSource.query(
        `UPDATE "branding_settings"
         SET "app_name" = NULL, "logo_path" = NULL, "accent_color" = NULL,
             "favicon_path" = NULL, "updated_at" = datetime('now')
         WHERE "id" = 'default'`
      );
    }
    deleteStoredFile(logoFilename);
    deleteStoredFile(faviconFilename);
    return this.getBranding();
  }
}
