import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-ignore — tailwind.config.js ships no type declarations
import tailwindConfig from '../../tailwind.config.js';

// Static audit of the real CSS file (the `?raw` import returns empty
// under vitest `css: false`, and import.meta.url is not a file: URL
// here, so resolve from the package root instead).
const cssText = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

/**
 * Token resolution guard (issue #27): every semantic color the Tailwind
 * config maps to `hsl(var(--x))` must be defined in BOTH the `:root`
 * (light) and `.dark` blocks of index.css, so no token is missing in
 * either theme. This is a static audit — jsdom does not compute styles.
 */
describe('semantic tokens resolve in both themes', () => {
  const rootBlock = String(cssText).split('.dark')[0];
  const darkBlock = String(cssText).split('.dark').slice(1).join('.dark');

  const colors = (tailwindConfig as any).theme.extend.colors as Record<
    string,
    any
  >;

  const varNames = new Set<string>();
  const walk = (node: unknown) => {
    if (typeof node === 'string') {
      const m = node.match(/var\(--([\w-]+)\)/);
      if (m) varNames.add(m[1]);
    } else if (node && typeof node === 'object') {
      Object.values(node).forEach(walk);
    }
  };
  // Only the semantic state tokens are covered by this guard; the
  // pre-existing base tokens are exercised by the app itself.
  for (const key of ['success', 'warning', 'info', 'destructive']) {
    walk(colors[key]);
  }

  it.each([...varNames])('token --%s is defined in :root and .dark', (name) => {
    expect(rootBlock).toContain(`--${name}:`);
    expect(darkBlock).toContain(`--${name}:`);
  });

  it('defines the layout / radius / shadow tokens in :root', () => {
    for (const name of [
      'page-max-width',
      'page-max-width-medium',
      'page-max-width-narrow',
      'page-padding-x',
      'section-gap',
      'radius-xl',
      'radius-2xl',
      'shadow-card',
      'shadow-popover',
      'shadow-lift',
      'shadow-selection',
    ]) {
      expect(rootBlock).toContain(`--${name}:`);
    }
  });
});

/**
 * Contrast guard (issue #6): compute WCAG contrast ratios from the real
 * HSL token values in index.css and assert AA for every text pairing
 * the app uses, in BOTH themes. Regression tests for the four known
 * gaps from #27 (muted, secondary, dark destructive text, input
 * borders) live here as explicit cases.
 */
describe('token contrast meets WCAG AA (issue #6)', () => {
  const parseVars = (block: string): Record<string, [number, number, number]> => {
    const vars: Record<string, [number, number, number]> = {};
    const re = /--([\w-]+)\s*:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) {
      vars[m[1]] = [parseFloat(m[2]), parseFloat(m[3]) / 100, parseFloat(m[4]) / 100];
    }
    return vars;
  };

  const hslToRgb = ([h, s, l]: [number, number, number]): [number, number, number] => {
    const hn = h / 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(hn + 1 / 3), f(hn), f(hn - 1 / 3)];
  };

  const luminance = (rgb: [number, number, number]) => {
    const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };

  const ratio = (a: [number, number, number], b: [number, number, number]) => {
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };

  const rootBlock = String(cssText).split('.dark')[0];
  // End the dark block at the next `@layer base` — the file later has a
  // `@media print` `.dark` override block with LIGHT values, which must
  // not pollute the real dark token values.
  const darkStart = String(cssText).indexOf('.dark {');
  const darkEnd = String(cssText).indexOf('@layer base', darkStart);
  const darkBlock = String(cssText).slice(darkStart, darkEnd);
  const light = parseVars(rootBlock);
  const dark = parseVars(darkBlock);

  // [fg token, bg token, min ratio, label] — checked in both themes.
  const TEXT_PAIRINGS: Array<[string, string, number, string]> = [
    ['foreground', 'background', 4.5, 'body text on background'],
    ['card-foreground', 'card', 4.5, 'text on card'],
    ['popover-foreground', 'popover', 4.5, 'text on popover/dialog'],
    ['primary-foreground', 'primary', 4.5, 'text on primary button'],
    ['secondary-foreground', 'secondary', 4.5, 'text on secondary button (#6 gap)'],
    ['muted-foreground', 'background', 4.5, 'muted text on background (#6 gap)'],
    ['muted-foreground', 'card', 4.5, 'muted text on card'],
    ['muted-foreground', 'muted', 4.5, 'muted text on muted bg (#6 gap)'],
    ['accent-foreground', 'accent', 4.5, 'text on accent'],
    ['destructive-foreground', 'destructive', 4.5, 'text on destructive button'],
    ['success-foreground', 'success', 4.5, 'success solid'],
    ['success-soft-foreground', 'success-soft', 4.5, 'success soft'],
    ['warning-foreground', 'warning', 4.5, 'warning solid'],
    ['warning-soft-foreground', 'warning-soft', 4.5, 'warning soft'],
    ['info-foreground', 'info', 4.5, 'info solid'],
    ['info-soft-foreground', 'info-soft', 4.5, 'info soft'],
    ['destructive-soft-foreground', 'destructive-soft', 4.5, 'destructive soft'],
  ];

  // UI-component boundaries (WCAG 1.4.11, 3:1).
  const UI_PAIRINGS: Array<[string, string, number, string]> = [
    ['input', 'background', 3, 'input border vs background (#6 gap)'],
    ['input', 'card', 3, 'input border vs card (#6 gap)'],
    ['ring', 'background', 3, 'focus ring vs background'],
    ['primary', 'background', 3, 'primary control vs background'],
  ];

  for (const [themeName, vars] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it.each(TEXT_PAIRINGS)(
      `${themeName}: %s`,
      (fg, bg, min, label) => {
        expect(vars[fg], `token --${fg} missing`).toBeDefined();
        expect(vars[bg], `token --${bg} missing`).toBeDefined();
        expect(ratio(hslToRgb(vars[fg]), hslToRgb(vars[bg]))).toBeGreaterThanOrEqual(min);
        expect(label).toBeTruthy();
      },
    );
    it.each(UI_PAIRINGS)(
      `${themeName} (UI): %s`,
      (fg, bg, min, label) => {
        expect(ratio(hslToRgb(vars[fg]), hslToRgb(vars[bg]))).toBeGreaterThanOrEqual(min);
        expect(label).toBeTruthy();
      },
    );
  }

  it('remaps text-destructive to the soft foreground in dark mode (#6)', () => {
    // The solid destructive red cannot satisfy AA as text on dark
    // surfaces (2.00:1); the remap in index.css is the fix.
    expect(cssText).toContain('.dark .text-destructive {');
    expect(cssText).toContain('hsl(var(--destructive-soft-foreground))');
    expect(cssText).toContain('.dark .text-destructive\\/80');
    expect(cssText).toContain('.dark .hover\\:text-destructive:hover');
  });

  it('declares color-scheme for native controls in both themes (#6)', () => {
    expect(rootBlock).toContain('color-scheme: light');
    expect(darkBlock).toContain('color-scheme: dark');
  });
});
