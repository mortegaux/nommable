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
