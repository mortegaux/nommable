import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ChefHat,
  ListTodo,
  Refrigerator,
  ShoppingBasket,
  UtensilsCrossed,
} from 'lucide-react';
import { batchCookingApi, mealPlanApi, pantryApi, shoppingListApi } from '@/services/api';
import type { MealPlan, PantryItem, ShoppingList } from '@nommable/shared';
import {
  formatDateKey,
  formatDaysUntil,
  getNextAction,
  summarizeKitchenToday,
  type KitchenTodayBatchPlan,
  type KitchenTodaySummary,
} from './kitchenToday';

const MAX_ROWS = 5;

function SectionCard({
  icon: Icon,
  title,
  count,
  viewAllHref,
  viewAllLabel,
  emptyText,
  emptyHref,
  emptyHrefLabel,
  children,
  hasRows,
  footer,
}: {
  icon: typeof ChefHat;
  title: string;
  count: number;
  viewAllHref: string;
  viewAllLabel: string;
  emptyText: string;
  emptyHref: string;
  emptyHrefLabel: string;
  children: React.ReactNode;
  hasRows: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-lg border border-border p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
          {title}
          {count > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({count})</span>
          )}
        </h2>
        <Link
          to={viewAllHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {viewAllLabel}
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
      {hasRows ? (
        children
      ) : (
        <p className="text-muted-foreground">
          {emptyText}{' '}
          <Link to={emptyHref} className="font-medium text-primary hover:underline">
            {emptyHrefLabel}
          </Link>
        </p>
      )}
      {footer}
    </section>
  );
}

export default function KitchenTodayPage() {
  const [summary, setSummary] = useState<KitchenTodaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState(false);

  useEffect(() => {
    loadToday();
  }, []);

  const loadToday = async () => {
    setLoading(true);
    setLoadError(null);
    setPartialError(false);
    try {
      // Meal-plan and shopping-list fetches are capped at pageSize 100
      // (the API max). That covers nearly all households; a household with
      // more would only miss plans beyond the first 100 here.
      const [pantryRes, mealPlansRes, batchRes, shoppingRes] = await Promise.allSettled([
        pantryApi.getAll(),
        mealPlanApi.getAll({ page: 1, pageSize: 100 }),
        batchCookingApi.getAll(),
        shoppingListApi.getAll({ page: 1, pageSize: 100 }),
      ]);

      const pantryItems: PantryItem[] =
        pantryRes.status === 'fulfilled' ? (pantryRes.value.data ?? []) : [];
      const mealPlans: MealPlan[] =
        mealPlansRes.status === 'fulfilled' ? (mealPlansRes.value.data ?? []) : [];
      const batchPlans: KitchenTodayBatchPlan[] =
        batchRes.status === 'fulfilled' ? (batchRes.value.data ?? []) : [];
      const shoppingLists: ShoppingList[] =
        shoppingRes.status === 'fulfilled' ? (shoppingRes.value.data ?? []) : [];

      if (
        pantryRes.status === 'rejected' &&
        mealPlansRes.status === 'rejected' &&
        batchRes.status === 'rejected' &&
        shoppingRes.status === 'rejected'
      ) {
        setLoadError('Could not load today’s kitchen. Check your connection and try again.');
        return;
      }
      if (
        pantryRes.status === 'rejected' ||
        mealPlansRes.status === 'rejected' ||
        batchRes.status === 'rejected' ||
        shoppingRes.status === 'rejected'
      ) {
        setPartialError(true);
      }

      setSummary(summarizeKitchenToday({ pantryItems, mealPlans, batchPlans, shoppingLists }));
    } catch (error) {
      console.error('Failed to load Dashboard:', error);
      setLoadError('Could not load today’s kitchen. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading today’s kitchen...</div>
      </div>
    );
  }

  if (loadError || !summary) {
    return (
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <div className="mt-6 bg-card rounded-lg border border-border p-6 shadow-sm">
          <p className="text-muted-foreground">{loadError ?? 'Nothing to show yet.'}</p>
          <button
            type="button"
            onClick={loadToday}
            className="mt-4 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const nextAction = getNextAction(summary);
  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">{todayLabel}</p>
      </div>

      {partialError && (
        <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm text-amber-800 dark:text-amber-200">
          Some sections couldn’t load. What’s below is based on the data that did load.
        </div>
      )}

      {/* Next useful action — prominent */}
      <section
        aria-label="Next useful action"
        className="mb-6 rounded-lg bg-primary p-6 text-primary-foreground shadow"
      >
        <p className="text-sm font-semibold uppercase tracking-wide opacity-80">Next up</p>
        <h2 className="mt-1 text-2xl font-bold">{nextAction.title}</h2>
        <p className="mt-1 opacity-90">{nextAction.detail}</p>
        <Link
          to={nextAction.href}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary-foreground px-4 py-2 font-medium text-primary shadow-sm transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary-foreground"
        >
          Take action
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Tonight's plan */}
        <SectionCard
          icon={ChefHat}
          title="Tonight's plan"
          count={summary.tonightsMeals.length}
          viewAllHref="/meal-plans"
          viewAllLabel="Meal plans"
          emptyText={
            summary.nextPlannedMeal
              ? `Nothing planned for today. Next up: ${summary.nextPlannedMeal.recipeTitle ?? 'a planned meal'} on ${formatDateKey(summary.nextPlannedMeal.dateKey)}.`
              : 'Nothing planned for today.'
          }
          emptyHref="/meal-plans/new"
          emptyHrefLabel="Plan a meal"
          hasRows={summary.tonightsMeals.length > 0}
        >
          <ul className="space-y-3">
            {summary.tonightsMeals.slice(0, MAX_ROWS).map((meal) => (
              <li key={meal.mealId}>
                <Link
                  to={meal.recipeId ? `/recipes/${meal.recipeId}` : `/meal-plans/${meal.planId}`}
                  className="block rounded-lg border border-border p-3 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {meal.recipeTitle ?? 'Planned meal'}
                    </span>
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      {meal.mealType}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {meal.time ? `${meal.time} · ` : ''}in “{meal.planName}”
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {summary.tonightsMeals.length > MAX_ROWS && (
            <p className="mt-3 text-sm text-muted-foreground">
              …and {summary.tonightsMeals.length - MAX_ROWS} more in the plan.
            </p>
          )}
        </SectionCard>

        {/* Expiring items */}
        <SectionCard
          icon={AlertTriangle}
          title="Expiring soon"
          count={summary.expiring.length}
          viewAllHref="/pantry"
          viewAllLabel="Pantry"
          emptyText="Nothing expiring in the next 7 days."
          emptyHref="/pantry"
          emptyHrefLabel="View pantry"
          hasRows={summary.expiring.length > 0}
        >
          <ul className="space-y-2">
            {summary.expiring.slice(0, MAX_ROWS).map(({ item, daysUntilExpiry }) => (
              <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">
                  {item.name} — {item.quantity} {item.unit}
                </span>
                <span
                  className={
                    daysUntilExpiry <= 0
                      ? 'font-semibold text-red-600 dark:text-red-400'
                      : 'font-medium text-amber-700 dark:text-amber-300'
                  }
                >
                  {formatDaysUntil(daysUntilExpiry)}
                </span>
              </li>
            ))}
          </ul>
          {summary.expiring.length > MAX_ROWS && (
            <p className="mt-3 text-sm text-muted-foreground">
              …and {summary.expiring.length - MAX_ROWS} more expiring soon.
            </p>
          )}
        </SectionCard>

        {/* Prep due */}
        <SectionCard
          icon={ListTodo}
          title="Prep due"
          count={summary.prepDue.length}
          viewAllHref="/batch-cooking"
          viewAllLabel="Batch cooking"
          emptyText="No prep due. Nothing cooking today."
          emptyHref="/batch-cooking"
          emptyHrefLabel="View batch cooking"
          hasRows={summary.prepDue.length > 0}
        >
          <ul className="space-y-2">
            {summary.prepDue.slice(0, MAX_ROWS).map((prep) => (
              <li key={`${prep.planId}-${prep.task}-${prep.order}`} className="text-sm">
                <span className="text-foreground">{prep.task}</span>
                <span className="text-muted-foreground">
                  {' '}
                  — “{prep.planName}” · {formatDateKey(prep.cookingDateKey)}
                </span>
              </li>
            ))}
          </ul>
          {summary.prepDue.length > MAX_ROWS && (
            <p className="mt-3 text-sm text-muted-foreground">
              …and {summary.prepDue.length - MAX_ROWS} more prep tasks.
            </p>
          )}
        </SectionCard>

        {/* Active leftovers */}
        <SectionCard
          icon={Refrigerator}
          title="Active leftovers"
          count={summary.leftovers.length}
          viewAllHref="/batch-cooking"
          viewAllLabel="Batch cooking"
          emptyText="No batch-cooked leftovers still good."
          emptyHref="/batch-cooking"
          emptyHrefLabel="View batch cooking"
          hasRows={summary.leftovers.length > 0}
        >
          <ul className="space-y-2">
            {summary.leftovers.slice(0, MAX_ROWS).map((leftover) => (
              <li key={leftover.planId} className="flex items-center justify-between gap-2 text-sm">
                <Link
                  to={leftover.recipeId ? `/recipes/${leftover.recipeId}` : '/batch-cooking'}
                  className="text-foreground hover:underline"
                >
                  {leftover.recipeTitle}
                </Link>
                <span className="text-muted-foreground">
                  Use by {formatDateKey(leftover.useByKey)} (
                  {leftover.daysRemaining === 0 ? 'today' : `${leftover.daysRemaining}d left`})
                </span>
              </li>
            ))}
          </ul>
          {summary.leftovers.length > MAX_ROWS && (
            <p className="mt-3 text-sm text-muted-foreground">
              …and {summary.leftovers.length - MAX_ROWS} more leftovers.
            </p>
          )}
        </SectionCard>

        {/* Low stock */}
        <SectionCard
          icon={ShoppingBasket}
          title="Low stock"
          count={summary.lowStock.length}
          viewAllHref="/pantry"
          viewAllLabel="Pantry"
          emptyText="Nothing flagged low stock."
          emptyHref="/pantry"
          emptyHrefLabel="View pantry"
          hasRows={summary.lowStock.length > 0}
          footer={
            <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
              {summary.activeShoppingLists.length > 0 ? (
                <>
                  {summary.activeShoppingLists.reduce((sum, list) => sum + list.uncheckedCount, 0)}{' '}
                  items left on {summary.activeShoppingLists.length} shopping list
                  {summary.activeShoppingLists.length === 1 ? '' : 's'}.{' '}
                </>
              ) : (
                <>No active shopping lists. </>
              )}
              <Link to="/shopping-lists" className="font-medium text-primary hover:underline">
                View shopping lists
              </Link>
            </p>
          }
        >
          <ul className="space-y-2">
            {summary.lowStock.slice(0, MAX_ROWS).map((item) => (
              <li key={item.id} className="text-sm text-foreground">
                {item.name} — {item.quantity} {item.unit} left
              </li>
            ))}
          </ul>
          {summary.lowStock.length > MAX_ROWS && (
            <p className="mt-3 text-sm text-muted-foreground">
              …and {summary.lowStock.length - MAX_ROWS} more low-stock items.
            </p>
          )}
        </SectionCard>

        {/* Upcoming */}
        <SectionCard
          icon={CalendarDays}
          title="Coming up"
          count={summary.nextPlannedMeal ? 1 : 0}
          viewAllHref="/meal-plans"
          viewAllLabel="Meal plans"
          emptyText="No upcoming meals planned."
          emptyHref="/meal-plans/new"
          emptyHrefLabel="Plan a meal"
          hasRows={summary.nextPlannedMeal !== null}
        >
          {summary.nextPlannedMeal && (
            <Link
              to={
                summary.nextPlannedMeal.recipeId
                  ? `/recipes/${summary.nextPlannedMeal.recipeId}`
                  : `/meal-plans/${summary.nextPlannedMeal.planId}`
              }
              className="block rounded-lg border border-border p-3 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {summary.nextPlannedMeal.recipeTitle ?? 'Planned meal'}
                </span>
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  {summary.nextPlannedMeal.mealType}
                </span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {formatDateKey(summary.nextPlannedMeal.dateKey)} · in “
                {summary.nextPlannedMeal.planName}”
              </div>
            </Link>
          )}
        </SectionCard>
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <UtensilsCrossed className="w-4 h-4" aria-hidden="true" />
        Read-only view — changes happen on the pantry, meal plan, and batch cooking pages.
      </p>
    </div>
  );
}
