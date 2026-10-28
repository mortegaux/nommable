/**
 * Frontend-local helpers for meal-plan entries.
 *
 * These intentionally live in the frontend (NOT in @nommable/shared) so the
 * redesign needs no shared-type or backend changes.
 *
 * TIME PERSISTENCE: the backend MealPlanRecipe row has no `time` column, so the
 * optional per-entry time is persisted by prefixing `notes` with `[HH:MM]`
 * (e.g. "[18:30] serve with garlic bread"). `encodeEntryNotes` /
 * `decodeEntryNotes` keep that convention in one place. Entries whose notes
 * have no prefix behave exactly as before, so existing plans load and render
 * unchanged.
 *
 * MEAL TYPE FALLBACK: the backend requires `mealType`, but defensively treat
 * a missing/unknown mealType as "dinner" (the most common main meal) so a
 * corrupt or legacy entry can never break rendering or sorting.
 */

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_TYPES: { type: MealType; label: string; badge: string }[] = [
  { type: 'breakfast', label: 'Breakfast', badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700' },
  { type: 'lunch', label: 'Lunch', badge: 'bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-200 border-green-300 dark:border-green-700' },
  { type: 'dinner', label: 'Dinner', badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-700' },
  { type: 'snack', label: 'Snack', badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-200 border-purple-300 dark:border-purple-700' },
];

export const MEAL_TYPE_ORDER: Record<MealType, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
};

/** Missing/unknown mealType falls back to "dinner" (documented above). */
export function resolveMealType(raw: unknown): MealType {
  return raw === 'breakfast' || raw === 'lunch' || raw === 'dinner' || raw === 'snack'
    ? raw
    : 'dinner';
}

const TIME_PREFIX_RE = /^\[(\d{2}:\d{2})\]\s*/;

/** Combine an optional "HH:MM" time with free-text notes for API persistence. */
export function encodeEntryNotes(time: string | undefined, notes?: string): string | undefined {
  const clean = (notes ?? '').trim();
  if (!time) return clean || undefined;
  return `[${time}]${clean ? ` ${clean}` : ''}`;
}

/** Split a persisted `[HH:MM]` prefix back out of notes. Prefix-free notes pass through untouched. */
export function decodeEntryNotes(notes?: string): { time?: string; notes?: string } {
  if (!notes) return {};
  const match = TIME_PREFIX_RE.exec(notes);
  if (!match) return { notes };
  const rest = notes.slice(match[0].length).trim();
  return { time: match[1], notes: rest || undefined };
}

/** "18:30" -> "6:30 PM". Returns the input unchanged if it does not parse. */
export function formatTimeForDisplay(time?: string): string | undefined {
  if (!time) return undefined;
  const parts = time.split(':');
  const h = Number(parts[0]);
  const min = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(min)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(min).padStart(2, '0')} ${period}`;
}

/**
 * Sort entries within a day: entries with a time first (chronological),
 * then by meal-type order (breakfast -> lunch -> dinner -> snack).
 */
export function compareEntries(
  a: { mealType: unknown; time?: string },
  b: { mealType: unknown; time?: string }
): number {
  if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
  if (a.time && !b.time) return -1;
  if (!a.time && b.time) return 1;
  return MEAL_TYPE_ORDER[resolveMealType(a.mealType)] - MEAL_TYPE_ORDER[resolveMealType(b.mealType)];
}

/**
 * Parse a date value as a LOCAL date.
 *
 * The backend stores plan dates in Postgres `date` columns, which arrive as
 * date-only strings ("2026-10-28"). `new Date("2026-10-28")` parses as UTC
 * midnight, which renders as the previous day in the Americas — a plan dated
 * 10/28 showed a header of 10/27. Appending 'T00:00:00' forces local-midnight
 * parsing, matching how the schedule headings already render. Full ISO strings
 * (and Date objects) pass through untouched.
 */
export function parseLocalDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
  return new Date(value);
}
