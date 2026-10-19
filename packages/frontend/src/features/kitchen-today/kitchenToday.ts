/**
 * Deterministic derivation rules for the Dashboard home screen.
 *
 * Pure functions only — no API calls, no AI, no mutations. The page fetches
 * data with the existing read-only API clients and runs it through these
 * rules. All date math compares LOCAL calendar days (YYYY-MM-DD), matching
 * the convention in batchCookingDates.ts: `new Date('YYYY-MM-DD')` parses as
 * UTC midnight, which is the previous evening in western timezones.
 */
import type { MealPlan, PantryItem, ShoppingList } from '@nommable/shared';
import { decodeEntryNotes, resolveMealType } from '@/features/meal-plans/mealPlanEntry';

/** Batch cooking plan shape needed by these rules (subset of the page-local type). */
export interface KitchenTodayBatchPlan {
  id: string;
  name: string;
  cookingDate: string;
  status: 'planned' | 'in-progress' | 'completed';
  storageMethod: 'refrigerate' | 'freeze' | 'pantry';
  storageDuration: number;
  prepChecklist?: Array<{ task: string; completed: boolean; order: number }>;
  recipe?: { id: string; title: string };
}

// ---------------------------------------------------------------------------
// Date helpers (local calendar days)
// ---------------------------------------------------------------------------

/** Parse a date-only string, ISO string, or Date as a local calendar day. Null when unparseable. */
export function parseLocalDay(value: string | Date | undefined | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/** Format a Date as 'YYYY-MM-DD' from local parts (no UTC round-trip). */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/** Today's date key in local time. */
export function todayKey(today: Date = new Date()): string {
  return toDateKey(today);
}

/** Whole calendar days from today until `value` (negative = past). Null when unparseable. */
export function daysUntil(
  value: string | Date | undefined | null,
  today: Date = new Date()
): number | null {
  const target = parseLocalDay(value);
  if (!target) return null;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
}

/** 'YYYY-MM-DD' key `days` after `key`. */
export function addDaysToKey(key: string, days: number): string {
  const parsed = parseLocalDay(key);
  if (!parsed) return key;
  parsed.setDate(parsed.getDate() + days);
  return toDateKey(parsed);
}

/** Human label for a date key: "Sat, Oct 17". Falls back to the raw key. */
export function formatDateKey(key: string): string {
  const parsed = parseLocalDay(key);
  if (!parsed) return key;
  return parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Human label for days-until: "Today" / "Tomorrow" / "In 3 days" / "Expired yesterday" / "Expired 3 days ago". */
export function formatDaysUntil(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1) return `In ${days} days`;
  if (days === -1) return 'Expired yesterday';
  return `Expired ${Math.abs(days)} days ago`;
}

// ---------------------------------------------------------------------------
// Expiring items
// ---------------------------------------------------------------------------

export interface ExpiringItem {
  item: PantryItem;
  daysUntilExpiry: number;
}

/**
 * Pantry items expiring within `windowDays` (default 7), including already
 * expired items, soonest first. Items without an expiration date are excluded.
 */
export function getExpiringItems(
  items: PantryItem[],
  windowDays = 7,
  today: Date = new Date()
): ExpiringItem[] {
  return items
    .map((item) => ({ item, daysUntilExpiry: daysUntil(item.expirationDate, today) }))
    .filter(
      (entry): entry is ExpiringItem =>
        entry.daysUntilExpiry !== null && entry.daysUntilExpiry <= windowDays
    )
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

// ---------------------------------------------------------------------------
// Tonight's plan
// ---------------------------------------------------------------------------

export interface PlannedMeal {
  planId: string;
  planName: string;
  mealId: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recipeId?: string;
  recipeTitle?: string;
  dateKey: string;
  time?: string;
  notes?: string;
}

function flattenMeals(plans: MealPlan[]): PlannedMeal[] {
  return plans.flatMap((plan) =>
    (plan.meals ?? []).map((meal) => {
      const date = parseLocalDay(meal.date as unknown as string | Date);
      const { time, notes } = decodeEntryNotes(meal.notes);
      return {
        planId: plan.id,
        planName: plan.name,
        mealId: meal.id,
        mealType: resolveMealType(meal.mealType),
        recipeId: meal.recipeId,
        recipeTitle: meal.recipe?.title,
        dateKey: date ? toDateKey(date) : '',
        time,
        notes,
      };
    })
  );
}

/** Meals dated today, ordered breakfast → lunch → dinner → snack. */
export function getTodaysMeals(plans: MealPlan[], today: Date = new Date()): PlannedMeal[] {
  const todayKeyValue = todayKey(today);
  const order = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 } as const;
  return flattenMeals(plans)
    .filter((meal) => meal.dateKey === todayKeyValue)
    .sort((a, b) => order[a.mealType] - order[b.mealType]);
}

/**
 * Tonight's plan: today's dinner meals when one is planned, otherwise all of
 * today's meals. Empty when nothing is planned today.
 */
export function getTonightsMeals(plans: MealPlan[], today: Date = new Date()): PlannedMeal[] {
  const todays = getTodaysMeals(plans, today);
  const dinners = todays.filter((meal) => meal.mealType === 'dinner');
  return dinners.length > 0 ? dinners : todays;
}

/** Earliest planned meal after today, for the "next planned meal" fallback. Null when none. */
export function getNextPlannedMeal(
  plans: MealPlan[],
  today: Date = new Date()
): PlannedMeal | null {
  const todayKeyValue = todayKey(today);
  const upcoming = flattenMeals(plans).filter((meal) => meal.dateKey > todayKeyValue);
  if (upcoming.length === 0) return null;
  upcoming.sort((a, b) => (a.dateKey === b.dateKey ? 0 : a.dateKey < b.dateKey ? -1 : 1));
  const earliestKey = upcoming[0].dateKey;
  const order = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 } as const;
  return upcoming
    .filter((meal) => meal.dateKey === earliestKey)
    .sort((a, b) => order[a.mealType] - order[b.mealType])[0];
}

// ---------------------------------------------------------------------------
// Prep due
// ---------------------------------------------------------------------------

export interface PrepTask {
  planId: string;
  planName: string;
  cookingDateKey: string;
  task: string;
  order: number;
}

/**
 * Prep due: unchecked checklist tasks on batch plans that are in progress or
 * cooking today. Ordered by cooking date, then checklist order.
 */
export function getPrepDue(plans: KitchenTodayBatchPlan[], today: Date = new Date()): PrepTask[] {
  const todayKeyValue = todayKey(today);
  return plans
    .filter(
      (plan) => plan.status === 'in-progress' || toDateKeyOf(plan.cookingDate) === todayKeyValue
    )
    .flatMap((plan) =>
      (plan.prepChecklist ?? [])
        .filter((entry) => !entry.completed)
        .map((entry) => ({
          planId: plan.id,
          planName: plan.name,
          cookingDateKey: toDateKeyOf(plan.cookingDate),
          task: entry.task,
          order: entry.order,
        }))
    )
    .sort((a, b) =>
      a.cookingDateKey === b.cookingDateKey
        ? a.order - b.order
        : a.cookingDateKey < b.cookingDateKey
          ? -1
          : 1
    );
}

function toDateKeyOf(value: string): string {
  const parsed = parseLocalDay(value);
  return parsed ? toDateKey(parsed) : value;
}

// ---------------------------------------------------------------------------
// Active leftovers (from batch cooking)
// ---------------------------------------------------------------------------

export interface Leftover {
  planId: string;
  planName: string;
  recipeId?: string;
  recipeTitle: string;
  useByKey: string;
  daysRemaining: number;
  storageMethod: 'refrigerate' | 'freeze' | 'pantry';
}

/**
 * Active leftovers: completed batch plans whose cooking date + storage
 * duration has not passed yet. The cooked food is still good — eat it before
 * the use-by day. Soonest use-by first.
 */
export function getActiveLeftovers(
  plans: KitchenTodayBatchPlan[],
  today: Date = new Date()
): Leftover[] {
  return plans
    .filter((plan) => plan.status === 'completed')
    .flatMap((plan) => {
      const cookingKey = toDateKeyOf(plan.cookingDate);
      const useByKey = addDaysToKey(cookingKey, plan.storageDuration);
      const daysRemaining = daysUntil(useByKey, today);
      if (daysRemaining === null || daysRemaining < 0) return [];
      return [
        {
          planId: plan.id,
          planName: plan.name,
          recipeId: plan.recipe?.id,
          recipeTitle: plan.recipe?.title ?? plan.name,
          useByKey,
          daysRemaining,
          storageMethod: plan.storageMethod,
        },
      ];
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

// ---------------------------------------------------------------------------
// Low stock + shopping lists
// ---------------------------------------------------------------------------

/** Pantry items flagged low stock. */
export function getLowStockItems(items: PantryItem[]): PantryItem[] {
  return items.filter((item) => item.isLowStock);
}

export interface ActiveShoppingList {
  id: string;
  name: string;
  uncheckedCount: number;
}

/** Shopping lists with unchecked items left. */
export function getActiveShoppingLists(lists: ShoppingList[]): ActiveShoppingList[] {
  return lists
    .map((list) => ({
      id: list.id,
      name: list.name,
      uncheckedCount: (list.items ?? []).filter((item) => !item.checked).length,
    }))
    .filter((list) => list.uncheckedCount > 0);
}

// ---------------------------------------------------------------------------
// Next useful action
// ---------------------------------------------------------------------------

export interface NextAction {
  title: string;
  detail: string;
  href: string;
}

export interface KitchenTodaySummary {
  expiring: ExpiringItem[];
  tonightsMeals: PlannedMeal[];
  nextPlannedMeal: PlannedMeal | null;
  prepDue: PrepTask[];
  leftovers: Leftover[];
  lowStock: PantryItem[];
  activeShoppingLists: ActiveShoppingList[];
}

/**
 * The single most urgent thing to do next, by fixed priority:
 * 1. something expired / expiring today → use it
 * 2. prep due → start prep
 * 3. dinner planned tonight → cook it
 * 4. leftovers still good → eat them
 * 5. low stock → restock
 * 6. otherwise → plan meals
 */
export function getNextAction(summary: KitchenTodaySummary): NextAction {
  const expiredOrToday = summary.expiring.filter((entry) => entry.daysUntilExpiry <= 0);
  if (expiredOrToday.length > 0) {
    const first = expiredOrToday[0];
    return {
      title: `Use up ${expiredOrToday.length === 1 ? 'the expiring item' : `${expiredOrToday.length} expiring items`}`,
      detail: `${first.item.name} — ${formatDaysUntil(first.daysUntilExpiry)}. Cook with it before it goes.`,
      href: '/pantry',
    };
  }

  if (summary.prepDue.length > 0) {
    const first = summary.prepDue[0];
    return {
      title: `Start today's prep — ${first.task}`,
      detail: `${summary.prepDue.length} prep task${summary.prepDue.length === 1 ? '' : 's'} waiting on "${first.planName}".`,
      href: '/batch-cooking',
    };
  }

  if (summary.tonightsMeals.length > 0) {
    const dinner = summary.tonightsMeals[0];
    return {
      title: `Cook tonight's dinner${dinner.recipeTitle ? `: ${dinner.recipeTitle}` : ''}`,
      detail: dinner.recipeTitle
        ? `Planned in "${dinner.planName}"${dinner.time ? ` at ${dinner.time}` : ''}.`
        : `Planned in "${dinner.planName}".`,
      href: dinner.recipeId ? `/recipes/${dinner.recipeId}` : `/meal-plans/${dinner.planId}`,
    };
  }

  if (summary.leftovers.length > 0) {
    const first = summary.leftovers[0];
    return {
      title: `Eat leftovers: ${first.recipeTitle}`,
      detail: `Still good until ${formatDateKey(first.useByKey)} — ${
        first.daysRemaining === 0
          ? 'use it today'
          : `${first.daysRemaining} day${first.daysRemaining === 1 ? '' : 's'} left`
      }.`,
      href: '/batch-cooking',
    };
  }

  if (summary.lowStock.length > 0) {
    const first = summary.lowStock[0];
    return {
      title: 'Restock the pantry',
      detail: `${summary.lowStock.length} item${summary.lowStock.length === 1 ? ' is' : 's are'} low — starting with ${first.name}.`,
      href: '/shopping-lists',
    };
  }

  return {
    title: 'Plan this week’s meals',
    detail: 'Nothing urgent on the board. Get ahead by planning the week.',
    href: '/meal-plans/new',
  };
}

/** Build the full summary from fetched data. */
export function summarizeKitchenToday(input: {
  pantryItems: PantryItem[];
  mealPlans: MealPlan[];
  batchPlans: KitchenTodayBatchPlan[];
  shoppingLists: ShoppingList[];
  today?: Date;
}): KitchenTodaySummary {
  const today = input.today ?? new Date();
  const expiring = getExpiringItems(input.pantryItems, 7, today);
  const tonightsMeals = getTonightsMeals(input.mealPlans, today);
  const nextPlannedMeal = getNextPlannedMeal(input.mealPlans, today);
  return {
    expiring,
    tonightsMeals,
    nextPlannedMeal,
    prepDue: getPrepDue(input.batchPlans, today),
    leftovers: getActiveLeftovers(input.batchPlans, today),
    lowStock: getLowStockItems(input.pantryItems),
    activeShoppingLists: getActiveShoppingLists(input.shoppingLists),
  };
}
