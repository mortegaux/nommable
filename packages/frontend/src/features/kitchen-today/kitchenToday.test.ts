import { describe, it, expect } from 'vitest';
import type { MealPlan, PantryItem, Recipe, ShoppingList } from '@nommable/shared';
import {
  addDaysToKey,
  daysUntil,
  formatDaysUntil,
  getActiveLeftovers,
  getActiveShoppingLists,
  getExpiringItems,
  getLowStockItems,
  getNextAction,
  getNextPlannedMeal,
  getPrepDue,
  getTonightsMeals,
  parseLocalDay,
  summarizeKitchenToday,
  toDateKey,
  type KitchenTodayBatchPlan,
} from './kitchenToday';

// Fixed "today": Saturday, October 17, 2026 (local). Never use `new Date()`
// in expectations — these rules compare calendar days, so tests must be stable.
const TODAY = new Date(2026, 9, 17);

function pantryItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: 'item-1',
    userId: 'user-1',
    name: 'Milk',
    quantity: 1,
    unit: 'gallon',
    category: 'Dairy',
    location: 'Fridge',
    isLowStock: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PantryItem;
}

function mealPlan(
  id: string,
  meals: Array<{
    id: string;
    dateKey: string;
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    recipeTitle?: string;
    recipeId?: string;
  }>
): MealPlan {
  return {
    id,
    userId: 'user-1',
    name: `Plan ${id}`,
    startDate: new Date(),
    endDate: new Date(),
    meals: meals.map((m) => ({
      id: m.id,
      mealPlanId: id,
      recipeId: m.recipeId ?? `recipe-${m.id}`,
      date: m.dateKey,
      mealType: m.mealType,
      servings: 2,
      recipe: m.recipeTitle ? ({ title: m.recipeTitle } as unknown as Recipe) : undefined,
    })),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as MealPlan;
}

function batchPlan(overrides: Partial<KitchenTodayBatchPlan> = {}): KitchenTodayBatchPlan {
  return {
    id: 'batch-1',
    name: 'Sunday Batch',
    cookingDate: '2026-10-17',
    status: 'planned',
    storageMethod: 'refrigerate',
    storageDuration: 4,
    prepChecklist: [],
    recipe: { id: 'recipe-1', title: 'Chili' },
    ...overrides,
  };
}

describe('parseLocalDay / daysUntil', () => {
  it('parses date-only strings as local calendar days (no UTC shift)', () => {
    const parsed = parseLocalDay('2026-10-17');
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(9);
    expect(parsed?.getDate()).toBe(17);
  });

  it('returns null for missing or unparseable dates', () => {
    expect(parseLocalDay(undefined)).toBeNull();
    expect(parseLocalDay('not-a-date')).toBeNull();
  });

  it('daysUntil counts whole calendar days from today', () => {
    expect(daysUntil('2026-10-17', TODAY)).toBe(0);
    expect(daysUntil('2026-10-18', TODAY)).toBe(1);
    expect(daysUntil('2026-10-16', TODAY)).toBe(-1);
    expect(daysUntil(undefined, TODAY)).toBeNull();
  });

  it('formatDaysUntil labels past / today / future', () => {
    expect(formatDaysUntil(0)).toBe('Today');
    expect(formatDaysUntil(1)).toBe('Tomorrow');
    expect(formatDaysUntil(3)).toBe('In 3 days');
    expect(formatDaysUntil(-1)).toBe('Expired yesterday');
    expect(formatDaysUntil(-3)).toBe('Expired 3 days ago');
  });

  it('toDateKey / addDaysToKey round-trip local days', () => {
    expect(toDateKey(new Date(2026, 9, 17))).toBe('2026-10-17');
    expect(addDaysToKey('2026-10-17', 4)).toBe('2026-10-21');
  });
});

describe('getExpiringItems', () => {
  it('includes expired and soon-expiring items, soonest first', () => {
    const items = [
      pantryItem({ id: 'a', name: 'Yogurt', expirationDate: new Date(2026, 9, 20) }),
      pantryItem({ id: 'b', name: 'Milk', expirationDate: new Date(2026, 9, 15) }),
      pantryItem({ id: 'c', name: 'Cheese', expirationDate: new Date(2026, 9, 17) }),
    ];
    const result = getExpiringItems(items, 7, TODAY);
    expect(result.map((r) => r.item.id)).toEqual(['b', 'c', 'a']);
    expect(result[0].daysUntilExpiry).toBe(-2);
  });

  it('excludes items expiring beyond the window and items with no date', () => {
    const items = [
      pantryItem({ id: 'a', name: 'Rice', expirationDate: new Date(2026, 10, 1) }),
      pantryItem({ id: 'b', name: 'Beans' }),
    ];
    expect(getExpiringItems(items, 7, TODAY)).toEqual([]);
  });
});

describe('getTonightsMeals / getNextPlannedMeal', () => {
  it('prefers dinner when dinner is planned today', () => {
    const plans = [
      mealPlan('p1', [
        { id: 'm1', dateKey: '2026-10-17', mealType: 'lunch', recipeTitle: 'Salad' },
        { id: 'm2', dateKey: '2026-10-17', mealType: 'dinner', recipeTitle: 'Tacos' },
      ]),
    ];
    expect(getTonightsMeals(plans, TODAY).map((m) => m.recipeTitle)).toEqual(['Tacos']);
  });

  it('falls back to all of today’s meals when no dinner is planned', () => {
    const plans = [
      mealPlan('p1', [
        { id: 'm1', dateKey: '2026-10-17', mealType: 'breakfast', recipeTitle: 'Oats' },
        { id: 'm2', dateKey: '2026-10-17', mealType: 'lunch', recipeTitle: 'Salad' },
      ]),
    ];
    expect(getTonightsMeals(plans, TODAY).map((m) => m.recipeTitle)).toEqual(['Oats', 'Salad']);
  });

  it('returns the earliest future meal as the next planned meal', () => {
    const plans = [
      mealPlan('p1', [
        { id: 'm1', dateKey: '2026-10-19', mealType: 'dinner', recipeTitle: 'Pasta' },
        { id: 'm2', dateKey: '2026-10-18', mealType: 'lunch', recipeTitle: 'Soup' },
      ]),
    ];
    expect(getNextPlannedMeal(plans, TODAY)?.recipeTitle).toBe('Soup');
    expect(getTonightsMeals(plans, TODAY)).toEqual([]);
  });

  it('returns null when nothing is planned after today', () => {
    expect(getNextPlannedMeal([], TODAY)).toBeNull();
  });
});

describe('getPrepDue', () => {
  it('collects unchecked tasks from in-progress plans and plans cooking today', () => {
    const plans = [
      batchPlan({
        id: 'b1',
        name: 'Chili Batch',
        cookingDate: '2026-10-17',
        status: 'planned',
        prepChecklist: [
          { task: 'Dice onions', completed: false, order: 1 },
          { task: 'Brown meat', completed: true, order: 2 },
        ],
      }),
      batchPlan({
        id: 'b2',
        name: 'Soup Batch',
        cookingDate: '2026-10-18',
        status: 'in-progress',
        prepChecklist: [{ task: 'Chop carrots', completed: false, order: 1 }],
      }),
    ];
    const result = getPrepDue(plans, TODAY);
    expect(result.map((r) => r.task)).toEqual(['Dice onions', 'Chop carrots']);
  });

  it('excludes planned future plans and completed tasks', () => {
    const plans = [
      batchPlan({
        id: 'b1',
        cookingDate: '2026-10-20',
        status: 'planned',
        prepChecklist: [{ task: 'Later task', completed: false, order: 1 }],
      }),
    ];
    expect(getPrepDue(plans, TODAY)).toEqual([]);
  });
});

describe('getActiveLeftovers', () => {
  it('includes completed plans still within their storage window', () => {
    const plans = [
      batchPlan({
        id: 'b1',
        cookingDate: '2026-10-15',
        status: 'completed',
        storageDuration: 4,
        recipe: { id: 'r1', title: 'Chili' },
      }),
      batchPlan({
        id: 'b2',
        cookingDate: '2026-10-10',
        status: 'completed',
        storageDuration: 4,
        recipe: { id: 'r2', title: 'Old Soup' },
      }),
    ];
    const result = getActiveLeftovers(plans, TODAY);
    expect(result.map((r) => r.recipeTitle)).toEqual(['Chili']);
    expect(result[0].useByKey).toBe('2026-10-19');
    expect(result[0].daysRemaining).toBe(2);
  });

  it('excludes non-completed plans', () => {
    const plans = [batchPlan({ status: 'planned', cookingDate: '2026-10-17' })];
    expect(getActiveLeftovers(plans, TODAY)).toEqual([]);
  });
});

describe('getLowStockItems / getActiveShoppingLists', () => {
  it('filters flagged items and lists with unchecked items', () => {
    const items = [
      pantryItem({ id: 'a', isLowStock: true }),
      pantryItem({ id: 'b', isLowStock: false }),
    ];
    expect(getLowStockItems(items).map((i) => i.id)).toEqual(['a']);

    const lists = [
      {
        id: 'l1',
        userId: 'u1',
        name: 'Weekly',
        items: [
          { id: 'i1', shoppingListId: 'l1', name: 'Eggs', checked: false, order: 1 },
          { id: 'i2', shoppingListId: 'l1', name: 'Bread', checked: true, order: 2 },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as ShoppingList,
      {
        id: 'l2',
        userId: 'u1',
        name: 'Done',
        items: [{ id: 'i3', shoppingListId: 'l2', name: 'Milk', checked: true, order: 1 }],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as ShoppingList,
    ];
    expect(getActiveShoppingLists(lists)).toEqual([
      { id: 'l1', name: 'Weekly', uncheckedCount: 1 },
    ]);
  });
});

describe('getNextAction priority', () => {
  const base = {
    expiring: [],
    tonightsMeals: [],
    nextPlannedMeal: null,
    prepDue: [],
    leftovers: [],
    lowStock: [],
    activeShoppingLists: [],
  };

  it('expired items beat everything else', () => {
    const summary = {
      ...base,
      expiring: [{ item: pantryItem({ name: 'Milk' }), daysUntilExpiry: -1 }],
      prepDue: [
        { planId: 'b1', planName: 'Batch', cookingDateKey: '2026-10-17', task: 'Chop', order: 1 },
      ],
    };
    expect(getNextAction(summary).href).toBe('/pantry');
    expect(getNextAction(summary).title).toContain('expiring');
  });

  it('prep beats dinner', () => {
    const summary = {
      ...base,
      prepDue: [
        { planId: 'b1', planName: 'Batch', cookingDateKey: '2026-10-17', task: 'Chop', order: 1 },
      ],
      tonightsMeals: [
        {
          planId: 'p1',
          planName: 'Plan',
          mealId: 'm1',
          mealType: 'dinner' as const,
          recipeTitle: 'Tacos',
          dateKey: '2026-10-17',
        },
      ],
    };
    expect(getNextAction(summary).href).toBe('/batch-cooking');
  });

  it('dinner beats leftovers, leftovers beat low stock, low stock beats planning', () => {
    const dinner = {
      ...base,
      tonightsMeals: [
        {
          planId: 'p1',
          planName: 'Plan',
          mealId: 'm1',
          mealType: 'dinner' as const,
          recipeTitle: 'Tacos',
          recipeId: 'r1',
          dateKey: '2026-10-17',
        },
      ],
      leftovers: [
        {
          planId: 'b1',
          planName: 'Batch',
          recipeTitle: 'Chili',
          useByKey: '2026-10-19',
          daysRemaining: 2,
          storageMethod: 'refrigerate' as const,
        },
      ],
      lowStock: [pantryItem()],
    };
    expect(getNextAction(dinner).title).toContain('Tacos');

    const leftoversOnly = { ...base, leftovers: dinner.leftovers, lowStock: dinner.lowStock };
    expect(getNextAction(leftoversOnly).title).toContain('leftovers');

    const lowStockOnly = { ...base, lowStock: dinner.lowStock };
    expect(getNextAction(lowStockOnly).href).toBe('/shopping-lists');
  });

  it('falls back to planning when the board is clear', () => {
    expect(getNextAction(base).href).toBe('/meal-plans/new');
  });
});

describe('summarizeKitchenToday', () => {
  it('combines all sections from fetched data', () => {
    const summary = summarizeKitchenToday({
      pantryItems: [
        pantryItem({
          id: 'a',
          name: 'Milk',
          expirationDate: new Date(2026, 9, 17),
          isLowStock: true,
        }),
      ],
      mealPlans: [
        mealPlan('p1', [
          { id: 'm1', dateKey: '2026-10-17', mealType: 'dinner', recipeTitle: 'Tacos' },
          { id: 'm2', dateKey: '2026-10-19', mealType: 'dinner', recipeTitle: 'Chili' },
        ]),
      ],
      batchPlans: [
        batchPlan({ status: 'completed', cookingDate: '2026-10-16', storageDuration: 4 }),
      ],
      shoppingLists: [],
      today: TODAY,
    });
    expect(summary.expiring).toHaveLength(1);
    expect(summary.tonightsMeals).toHaveLength(1);
    expect(summary.nextPlannedMeal?.recipeTitle).toBe('Chili');
    expect(summary.leftovers).toHaveLength(1);
    expect(summary.lowStock).toHaveLength(1);
  });
});
