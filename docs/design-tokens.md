# Design tokens & page anatomy (issue #27)

The interface contract for Nommable screens. All tokens live in one place:
CSS variables in `packages/frontend/src/index.css` (`:root` + `.dark`),
mapped to Tailwind utilities in `packages/frontend/tailwind.config.js`.
Components use the semantic utilities (`bg-success-soft`, `text-warning`, …),
never raw palette classes (`bg-green-100`, `text-amber-600`, …) except for
data visualization (charts, meal-type colors, star ratings).

## Page anatomy

Every content page uses `PageHeader` (`components/PageHeader.tsx`):

- Title: `text-3xl font-bold`, with an optional `titleAdornment` (e.g. an
  `InfoTooltip`) inside the heading.
- Subtitle (muted line under the title): entity count ("12 collections")
  or one concise line of purpose — not both, and never a paragraph.
- ONE primary action, upper right (`primaryAction`). It uses the default
  (primary) button style.
- Secondary actions (`secondaryActions`) are quiet (outline / ghost styles)
  and render left of the primary action.
- Destructive actions are never the primary action. They keep their
  destructive styling, are confirm-gated, and are separated from the primary.
  (Known deviation, see Follow-ups: CollectionDetail still renders Delete in
  the header row; spatial separation into a Danger Zone is future work.)
- On narrow screens the actions stack below the title.

Page width uses `PageShell` (`width`: `wide` = list pages, `medium`,
`narrow` = detail / form pages), backed by `--page-max-width*` tokens.
The app shell (`DashboardLayout`) already supplies page padding.

## Hierarchy

- One visual primary action per page/section. Everything else is quiet.
- Dense data gets progressive disclosure (tabs, collapsibles, pagination) —
  do not render every record at once.
- Destructive confirmations go through the confirm dialog (`confirm.store`),
  never an inline destructive button alone.

## Tokens

### Color — semantic

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` / `foreground` | cream / warm brown | near-black / near-white | page |
| `card` / `card-foreground` | white / warm brown | near-black / near-white | cards, dialogs |
| `primary` / `primary-foreground` | terracotta / white | near-white / near-black | primary actions |
| `secondary` / `secondary-foreground` | herb green / white | dark slate / near-white | secondary actions |
| `muted` / `muted-foreground` | beige / warm gray | dark slate / gray | muted text, skeletons |
| `accent` / `accent-foreground` | honey / black | dark slate / near-white | hover, accents |
| `destructive` / `destructive-foreground` | tomato red / white | dark red / near-white | errors, destructive |
| `success` / `success-foreground` | green-700 / white | green-400 / green-950 | success states |
| `warning` / `warning-foreground` | amber-800 / white | amber-400 / amber-950 | warnings, running state |
| `info` / `info-foreground` | blue-700 / white | blue-400 / blue-950 | info, how-it-works |

Each state also has a **soft** pair for callouts/badges: `*-soft` (tint
background) + `*-soft-foreground` (text on the tint). `Callout`
(`components/Callout.tsx`) is the one callout pattern; `InfoBanner` is
built on it (`tip` → `success` tone).

### Color — primitives (do not use directly for UI states)

`coral` / `herb` palettes in `tailwind.config.js` are brand primitives for
data visualization and gamification badges only. UI states use the
semantic tokens above.

### Contrast (WCAG AA, computed)

Every text-on-background pairing of the semantic tokens meets AA (4.5:1
normal text) in both themes:

| Pairing | Light | Dark |
|---|---|---|
| success solid (fg on DEFAULT) | 5.02 | 8.55 |
| success soft (soft-fg on soft) | 8.70 | 12.30 |
| warning solid | 7.09 | 8.97 |
| warning soft | 8.75 | 12.03 |
| info solid | 6.70 | 5.78 |
| info soft | 9.52 | 10.34 |
| destructive soft | 8.96 | 9.16 |
| primary solid | 5.33 | 17.06 |
| destructive solid | 4.80 | 9.58 |
| foreground on background | 11.53 | 19.12 |
| **secondary solid** (fixed #6: `--secondary` light 45% → 34%) | **5.01** | 13.95 |
| **muted-foreground on background** (fixed #6: light 45% → 38%) | **5.70** | 7.80 |
| **muted-foreground on muted** (fixed #6) | **4.89** | 5.70 |
| **muted-foreground on card** (fixed #6) | **6.05** | 7.80 |

**Fixed in #6 (were known gaps in #27):**
- `muted-foreground` on `background` (light): 4.36 → **5.70** (token
  value `--muted-foreground` light 45% → 38%).
- `secondary-foreground` (white) on `secondary` (light): 3.07 → **5.01**
  (token value `--secondary` light 45% → 34%).
- Direct `text-destructive` on card/background in dark mode: 2.00 → **9.14**
  via a dark-mode remap in `index.css`: `.dark .text-destructive` (and
  `/80` + hover variants) resolves to `--destructive-soft-foreground`.
  Rationale: no single `--destructive` dark value can satisfy both
  white-text-on-destructive-button (needs the red dark) and
  destructive-text-on-background (needs the red light) at AA — the two
  constraints have no overlapping lightness. Buttons keep
  `bg-destructive` + `text-destructive-foreground` (9.56:1); error text
  uses the remap. Error *panels* use `Callout tone="error"`.
- Favorites heart (`text-red-500`): re-measured in #6 — it passes 3:1
  for graphics in both themes (3.76 light, 5.31 dark). No change needed;
  the #27 note was incorrect.
- Input borders now meet WCAG 1.4.11 (3:1): `--input` light 85% → 50%
  (3.70 vs card, 3.48 vs background), dark 17.5% → 45% (3.64 vs
  background). Card/divider `--border` was darkened for visibility
  (light 85% → 72%, dark 17.5% → 28%) but is decorative — content, not
  the boundary, identifies a card — so 3:1 is not claimed for it.
- `color-scheme: light` on `:root` / `dark` on `.dark` so native
  controls (date-picker calendar icon, scrollbars) render in the active
  theme. This fixes the pantry "calendar control not visible" issue:
  the expiry date input's picker icon was invisible in dark mode.

**Remaining notes for future audits:**
- Badge/chip maps (`bg-X-100 text-X-800` light /
  `bg-X-900/40 text-X-200` dark) all pass AA (computed in #6).
- Category dots (shopping lists) moved `-500` → `-600` (Snacks
  `-700`, Other `-500` gray) so all dots pass 3:1 on white and dark
  card. Star ratings: filled stars `text-amber-600 dark:text-amber-400`
  (3:1 graphics), unfilled star outlines full `text-muted-foreground`
  (was 40% opacity).

### Spacing / layout

| Token | Value | Use |
|---|---|---|
| `--page-max-width` | 80rem | wide list pages |
| `--page-max-width-medium` | 64rem | medium pages |
| `--page-max-width-narrow` | 56rem | detail / form pages |
| `--page-padding-x` | 1rem | page horizontal padding |
| `--section-gap` | 1.5rem | gap between page sections |

### Type

Page title is `text-3xl font-bold` (in `PageHeader`). Section titles are
`text-lg font-semibold`. Body text is the default size; helper text is
`text-sm text-muted-foreground`. No custom font sizes outside these —
if a screen needs one, add a token first.

### Radius / shadow

Radius: `--radius` (0.5rem) with `sm` / `md` / `lg` derived, plus
`--radius-xl` / `--radius-2xl`. Shadows: `shadow-card`, `shadow-popover`,
`shadow-lift` (hover), `shadow-selection` (bottom selection bar).
Shadows are stronger in dark mode. The old `hover-lift` utility is
superseded by `shadow-lift`.

### States

- Loading: `LoadingSkeleton` (`card` / `list` / `text`).
- Empty: `EmptyState` (dashed card, title, muted description, action).
- Error + retry: `Callout tone="error" role="alert"` with a Retry button
  (see AnalyticsPage).
- Permission denied / offline / destructive confirmation: confirm dialog
  (`confirm.store`) + `Callout` for context. No new one-off patterns.

### Copy (not rewritten in this PR)

Action labels describe outcomes ("Create Collection", not "OK"). Error text
tells the user what to do next ("Failed to load stats" → add a retry /
next step). Copy inconsistencies found during this work are listed in
Follow-ups; the copy rewrite pass is separate.

## Branding plug-in point (for #55)

All tokens are CSS variables on `:root` / `.dark` in one file
(`index.css`). A future instance-branding override (app name, logo,
accent color) plugs in by overriding variables — e.g. a `[data-brand]`
ruleset or an injected stylesheet that redefines `--primary`,
`--accent`, and the layout tokens — without touching components, because
components only reference semantic utilities. Do NOT build branding UI
here; this is the seam it will use.

## Follow-ups (deliberately NOT done in #27)

- **#5 (mobile responsiveness):** verify 390px / 768px / 1280px + long-content
  stress for every primary workflow. PageHeader stacks actions on narrow
  screens, but no systematic verification was done here.
- **#6 (dark-mode / contrast audit):** DONE — token values fixed, remap
  rule, component fixes, contrast-guard tests. Remaining for a future
  pass: full keyboard-flow audit (focus *order*, landmarks, status
  announcements beyond `role="alert"`, 44px touch targets — focus
  *visibility* was fixed in #6), Kitchen Today (not in the #6 base;
  audit it once branched from current main).
- **Keyboard / a11y audit:** focus order, landmarks, status announcements
  beyond `role="alert"` on error callouts, 44px touch targets. Fold into
  #5 / #6.
- **Copy rewrite pass:** audit action labels + error strings
  ("Failed to load stats" has no next step; "Couldn't load analytics"
  is now the Callout pattern to copy).
- **Remaining raw-color conversions:** ~180 raw Tailwind palette classes
  remain in feature pages (meal-type colors, badge maps, status chips in
  Analytics / Batch Cooking / Feedback / Gamification / Meal Plans /
  Pantry / Recipes). They were left in place to keep this diff reviewable;
  convert them to semantic tokens (or document as data-viz exemptions)
  in follow-ups. Shared components (InfoTooltip, AIConfigAlert, Timer,
  NewRecipeMenu) are already converted.
- **Destructive spatial separation:** CollectionDetail's Delete still sits
  in the header row (confirm-gated, destructive styling). Move destructive
  page actions to a Danger Zone section in a follow-up.
- **Pages not converted** (file changed on remote main after the local
  base, so editing would clobber remote work): PantryPage, SettingsPage.
  Convert them to PageHeader in a follow-up branched from current main.
  Kitchen Today (`/kitchen-today`) was not converted either — it is a
  dashboard, not a list/detail page; decide its anatomy in a follow-up.
