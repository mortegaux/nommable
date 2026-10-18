import { useEffect, useRef, useState } from 'react';
import { useBrandingStore } from '@/store/branding.store';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader } from '@/components/PageHeader';
import { Callout } from '@/components/Callout';
import {
  ACCENT_PALETTE,
  DEFAULT_APP_NAME,
  DEFAULT_LOGO_URL,
  MAX_APP_NAME_LENGTH,
  MAX_BRANDING_UPLOAD_BYTES,
  contrastRatio,
  isContrastSafeAccent,
  isValidHexColor,
} from '@/features/settings/branding';

function extractError(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const data = (err as { response?: { data?: { error?: unknown } } }).response?.data;
    if (typeof data?.error === 'string') return data.error;
  }
  return 'Something went wrong. Please try again.';
}

function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Please choose an image file.';
  if (file.type === 'image/svg+xml') return 'SVG files are not allowed (they can contain scripts).';
  if (file.size > MAX_BRANDING_UPLOAD_BYTES) return 'Image must be 5MB or smaller.';
  return null;
}

export default function BrandingSettingsPage() {
  const branding = useBrandingStore((s) => s.branding);
  const user = useAuthStore((s) => s.user);
  const updateBranding = useBrandingStore((s) => s.updateBranding);
  const uploadLogo = useBrandingStore((s) => s.uploadLogo);
  const removeLogo = useBrandingStore((s) => s.removeLogo);
  const uploadFavicon = useBrandingStore((s) => s.uploadFavicon);
  const removeFavicon = useBrandingStore((s) => s.removeFavicon);
  const resetBranding = useBrandingStore((s) => s.resetBranding);

  const [appName, setAppName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [accent, setAccent] = useState<string | null>(null);
  const [customHex, setCustomHex] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'favicon' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // Seed the form from the server-side branding once it loads.
  useEffect(() => {
    if (branding && !nameTouched) {
      setAppName(branding.appName ?? '');
      setAccent(branding.accentColor);
      setCustomHex(branding.accentColor ?? '');
    }
  }, [branding, nameTouched]);

  useEffect(() => () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    if (faviconPreview) URL.revokeObjectURL(faviconPreview);
  }, [logoPreview, faviconPreview]);

  if (!user || user.role !== 'admin') {
    return (
      <div className="mx-auto max-w-3xl">
        <Callout tone="error">Only admins can change instance branding.</Callout>
      </div>
    );
  }

  const isCustomHex = accent !== null && !(ACCENT_PALETTE as readonly string[]).includes(accent);
  const customHexError =
    customHex.trim() !== '' && !isValidHexColor(customHex.trim())
      ? 'Enter a hex color like #C2410C.'
      : customHex.trim() !== '' && !isContrastSafeAccent(customHex.trim())
        ? 'Too light — primary text would not stay readable (needs 4.5:1 against white).'
        : '';
  const accentPreview = accent ?? null;
  const accentContrast = accentPreview ? contrastRatio(accentPreview, '#FFFFFF') : null;

  const flash = (msg: string) => {
    setMessage(msg);
    setError('');
  };
  const flashError = (msg: string) => {
    setError(msg);
    setMessage('');
  };

  const handleSaveNameAndAccent = async () => {
    setSaving(true);
    try {
      const trimmedName = appName.trim();
      await updateBranding({
        appName: trimmedName === '' ? null : trimmedName,
        accentColor: accent,
      });
      flash('Branding saved.');
    } catch (err) {
      flashError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePickFile = (
    file: File | undefined,
    kind: 'logo' | 'favicon'
  ) => {
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      flashError(problem);
      return;
    }
    setError('');
    const url = URL.createObjectURL(file);
    if (kind === 'logo') {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoFile(file);
      setLogoPreview(url);
    } else {
      if (faviconPreview) URL.revokeObjectURL(faviconPreview);
      setFaviconFile(file);
      setFaviconPreview(url);
    }
  };

  const handleUpload = async (kind: 'logo' | 'favicon') => {
    const file = kind === 'logo' ? logoFile : faviconFile;
    if (!file) return;
    setUploading(kind);
    try {
      if (kind === 'logo') {
        await uploadLogo(file);
        setLogoFile(null);
        setLogoPreview(null);
        if (logoInputRef.current) logoInputRef.current.value = '';
      } else {
        await uploadFavicon(file);
        setFaviconFile(null);
        setFaviconPreview(null);
        if (faviconInputRef.current) faviconInputRef.current.value = '';
      }
      flash(kind === 'logo' ? 'Logo uploaded.' : 'Favicon uploaded.');
    } catch (err) {
      flashError(extractError(err));
    } finally {
      setUploading(null);
    }
  };

  const handleRemove = async (kind: 'logo' | 'favicon') => {
    try {
      if (kind === 'logo') await removeLogo();
      else await removeFavicon();
      flash(kind === 'logo' ? 'Logo removed — stock logo restored.' : 'Favicon removed — stock favicon restored.');
    } catch (err) {
      flashError(extractError(err));
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset all branding to the Nommable defaults (name, logo, accent, favicon)?')) {
      return;
    }
    try {
      await resetBranding();
      setAppName('');
      setAccent(null);
      setCustomHex('');
      setLogoFile(null);
      setLogoPreview(null);
      setFaviconFile(null);
      setFaviconPreview(null);
      flash('Branding reset to defaults.');
    } catch (err) {
      flashError(extractError(err));
    }
  };

  const inputClass =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent';
  const quietButton =
    'rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50';
  const primaryButton =
    'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50';

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Branding"
        subtitle="Customize this instance's name, logo, accent color, and favicon. Branding is stored on the server and applies to every user and browser."
      />

      {message && (
        <Callout tone="success" role="status">
          {message}
        </Callout>
      )}
      {error && (
        <Callout tone="error" role="alert">
          {error}
        </Callout>
      )}

      {/* App name */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold text-card-foreground">App name</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Shown in the header, on the login page, and in the browser tab title. Leave blank
          to use the default “{DEFAULT_APP_NAME}”.
        </p>
        <label htmlFor="branding-app-name" className="mb-1 block text-sm font-medium">
          App name
        </label>
        <input
          id="branding-app-name"
          type="text"
          value={appName}
          maxLength={MAX_APP_NAME_LENGTH}
          onChange={(e) => {
            setAppName(e.target.value);
            setNameTouched(true);
          }}
          placeholder={DEFAULT_APP_NAME}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {appName.length}/{MAX_APP_NAME_LENGTH} characters. Letters, numbers, spaces, and
          punctuation — no markup.
        </p>
      </section>

      {/* Accent color */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold text-card-foreground">Accent color</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Applied to buttons, links, and highlights. It works in both light and dark mode —
          dark mode uses a lightened version of the same hue. Every accent keeps primary
          text readable at WCAG AA.
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent color">
          <button
            type="button"
            role="radio"
            aria-checked={accent === null}
            onClick={() => {
              setAccent(null);
              setCustomHex('');
            }}
            className={`rounded-full border px-3 py-1.5 text-sm ${accent === null ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background'}`}
          >
            Default
          </button>
          {ACCENT_PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={accent === hex}
              aria-label={`Accent ${hex}`}
              title={hex}
              onClick={() => {
                setAccent(hex);
                setCustomHex(hex);
              }}
              className={`h-8 w-8 rounded-full border-2 ${accent === hex ? 'border-foreground' : 'border-transparent'}`}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
        <label htmlFor="branding-custom-hex" className="mb-1 block text-sm font-medium">
          Custom hex
        </label>
        <div className="flex items-center gap-2">
          <input
            id="branding-custom-hex"
            type="text"
            value={customHex}
            onChange={(e) => {
              const value = e.target.value;
              setCustomHex(value);
              if (isValidHexColor(value.trim())) setAccent(value.trim().toUpperCase());
            }}
            placeholder="#C2410C"
            className={`${inputClass} max-w-xs`}
          />
          {accentPreview && (
            <span
              className="inline-block h-8 w-8 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: accentPreview }}
              aria-hidden="true"
            />
          )}
          {accentContrast !== null && (
            <span className="text-sm text-muted-foreground">
              {accentContrast.toFixed(1)}:1 vs white
            </span>
          )}
        </div>
        {customHexError && <p className="mt-2 text-sm text-destructive">{customHexError}</p>}
        {isCustomHex && !customHexError && (
          <p className="mt-2 text-sm text-muted-foreground">Custom accent {accent}.</p>
        )}
        <div className="mt-6">
          <button
            type="button"
            onClick={handleSaveNameAndAccent}
            disabled={saving || customHexError !== ''}
            className={primaryButton}
          >
            {saving ? 'Saving…' : 'Save name & accent'}
          </button>
        </div>
      </section>

      {/* Logo */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold text-card-foreground">Logo</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Replaces the header logo. Images only, 5MB max. If the custom logo is missing or
          broken, the stock logo is shown instead — never a broken image.
        </p>
        <div className="mb-4 flex items-center gap-4">
          <img
            src={logoPreview ?? branding?.logoUrl ?? DEFAULT_LOGO_URL}
            alt="Current logo preview"
            className="h-12 w-12 rounded-lg border border-border bg-background object-contain"
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.dataset.fallback) {
                img.dataset.fallback = '1';
                img.src = DEFAULT_LOGO_URL;
              }
            }}
          />
          <span className="text-sm text-muted-foreground">
            {logoPreview
              ? 'Preview of the file you picked (not uploaded yet).'
              : branding?.logoUrl
                ? 'Custom logo in use.'
                : 'Stock logo in use.'}
          </span>
        </div>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
          className="mb-3 block text-sm"
          aria-label="Choose a logo image"
          onChange={(e) => handlePickFile(e.target.files?.[0], 'logo')}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleUpload('logo')}
            disabled={!logoFile || uploading === 'logo'}
            className={primaryButton}
          >
            {uploading === 'logo' ? 'Uploading…' : 'Upload logo'}
          </button>
          {branding?.logoUrl && (
            <button type="button" onClick={() => handleRemove('logo')} className={quietButton}>
              Remove custom logo
            </button>
          )}
        </div>
      </section>

      {/* Favicon */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold text-card-foreground">Favicon</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Replaces the browser-tab icon. A square PNG works best. Images only, 5MB max.
        </p>
        <div className="mb-4 flex items-center gap-4">
          <img
            src={faviconPreview ?? branding?.faviconUrl ?? '/favicon-32x32.png'}
            alt="Current favicon preview"
            className="h-8 w-8 rounded border border-border bg-background object-contain"
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.dataset.fallback) {
                img.dataset.fallback = '1';
                img.src = '/favicon-32x32.png';
              }
            }}
          />
          <span className="text-sm text-muted-foreground">
            {faviconPreview
              ? 'Preview of the file you picked (not uploaded yet).'
              : branding?.faviconUrl
                ? 'Custom favicon in use.'
                : 'Stock favicon in use.'}
          </span>
        </div>
        <input
          ref={faviconInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
          className="mb-3 block text-sm"
          aria-label="Choose a favicon image"
          onChange={(e) => handlePickFile(e.target.files?.[0], 'favicon')}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleUpload('favicon')}
            disabled={!faviconFile || uploading === 'favicon'}
            className={primaryButton}
          >
            {uploading === 'favicon' ? 'Uploading…' : 'Upload favicon'}
          </button>
          {branding?.faviconUrl && (
            <button type="button" onClick={() => handleRemove('favicon')} className={quietButton}>
              Remove custom favicon
            </button>
          )}
        </div>
      </section>

      {/* Reset */}
      <section className="rounded-lg border border-destructive/40 bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold text-card-foreground">Reset to defaults</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Restores the stock Nommable name, logo, accent color, and favicon.
        </p>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-md border border-destructive bg-background px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          Reset to defaults
        </button>
      </section>
    </div>
  );
}
