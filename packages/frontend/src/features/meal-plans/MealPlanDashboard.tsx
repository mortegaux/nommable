import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { mealPlanApi } from '@/services/api';
import { Bookmark, Calendar, Clock, Flame, Recycle, UtensilsCrossed } from 'lucide-react';
import { MealPlanShoppingListIntegration } from './MealPlanShoppingListIntegration';
import { SaveAsTemplateModal } from './SaveAsTemplateModal';
import type { MealPlan, MealPlanRecipe } from '@nommable/shared';
import { compareEntries, decodeEntryNotes, formatTimeForDisplay, parseLocalDate, resolveMealType } from './mealPlanEntry';
import { useToastStore } from '@/store/toast.store';
import { PageHeader, PageShell } from '@/components/PageHeader';

const MEAL_TYPE_CONFIG = {
  breakfast: { dot: 'bg-amber-500', label: 'Breakfast' },
  lunch: { dot: 'bg-green-500', label: 'Lunch' },
  dinner: { dot: 'bg-blue-500', label: 'Dinner' },
  snack: { dot: 'bg-purple-500', label: 'Snack' },
};

export default function MealPlanDashboard() {
  const toast = useToastStore();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);

  useEffect(() => {
    if (id) {
      loadMealPlan(id);
    }
  }, [id]);

  const loadMealPlan = async (planId: string) => {
    try {
      const response = await mealPlanApi.getById(planId);
      setMealPlan(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load meal plan');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!id) return;
    try {
      await mealPlanApi.exportToCalendar(id);
    } catch (err) {
      toast.error('Failed to export calendar. Please try again.');
    }
  };

  const handleTemplateSaved = () => {
    toast.success('Template saved.');
  };

  // Group meals by date
  const groupMealsByDate = () => {
    if (!mealPlan) return {};

    const grouped: { [key: string]: MealPlanRecipe[] } = {};

    mealPlan.meals.forEach(meal => {
      const dateKey = new Date(meal.date).toISOString().split('T')[0];
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(meal);
    });

    return grouped;
  };

  const calculateNutritionSummary = () => {
    if (!mealPlan) return null;
    const totalMeals = mealPlan.meals.length;
    if (totalMeals === 0) return null;

    let totalCalories = 0,
      totalProtein = 0,
      totalCarbs = 0,
      totalFat = 0;
    let mealsWithNutrition = 0;

    for (const meal of mealPlan.meals) {
      const nutrition = meal.recipe?.nutrition;
      if (nutrition) {
        mealsWithNutrition++;
        totalCalories += nutrition.calories || 0;
        totalProtein += nutrition.protein || 0;
        totalCarbs += nutrition.carbohydrates || 0;
        totalFat += nutrition.fat || 0;
      }
    }

    if (mealsWithNutrition === 0) return null;

    return {
      avgCalories: Math.round(totalCalories / mealsWithNutrition),
      avgProtein: Math.round(totalProtein / mealsWithNutrition),
      avgCarbs: Math.round(totalCarbs / mealsWithNutrition),
      avgFat: Math.round(totalFat / mealsWithNutrition),
    };
  };

  // Calculate prep timeline
  const calculatePrepTimeline = () => {
    if (!mealPlan) return { totalPrepTime: 0, totalCookTime: 0 };

    const totalPrepTime = mealPlan.meals.reduce((sum, meal) => {
      return sum + (meal.recipe?.prepTime || 0);
    }, 0);

    const totalCookTime = mealPlan.meals.reduce((sum, meal) => {
      return sum + (meal.recipe?.cookTime || 0);
    }, 0);

    return { totalPrepTime, totalCookTime };
  };

  // Find leftover indicators (same recipe appearing multiple times)
  const findLeftovers = () => {
    if (!mealPlan) return {};

    const recipeCount: { [key: string]: number } = {};

    mealPlan.meals.forEach(meal => {
      if (meal.recipe) {
        recipeCount[meal.recipe.id] = (recipeCount[meal.recipe.id] || 0) + 1;
      }
    });

    return Object.fromEntries(
      Object.entries(recipeCount).filter(([_, count]) => count > 1)
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading meal plan</div>
      </div>
    );
  }

  if (error || !mealPlan) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center">
        <p className="text-destructive mb-4">{error || 'Meal plan not found'}</p>
        <button
          onClick={() => navigate('/meal-plans')}
          className="text-sm text-primary hover:underline"
        >
          Back to meal plans
        </button>
      </div>
    );
  }

  const groupedMeals = groupMealsByDate();
  const sortedDates = Object.keys(groupedMeals).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );
  const nutrition = calculateNutritionSummary();
  const timeline = calculatePrepTimeline();
  const leftovers = findLeftovers();

  return (
    <PageShell>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <Link to="/meal-plans" className="hover:text-foreground transition-colors">
          Meal Plans
        </Link>
        <span>/</span>
        <span>{mealPlan.name}</span>
      </div>
      <PageHeader
        title={mealPlan.name}
        subtitle={
          <>
            {mealPlan.description && <p>{mealPlan.description}</p>}
            <p className="mt-2 text-sm font-mono tabular-nums">
              {parseLocalDate(mealPlan.startDate).toLocaleDateString()} -{' '}
              {parseLocalDate(mealPlan.endDate).toLocaleDateString()}
            </p>
          </>
        }
        secondaryActions={
          <>
            <button
              onClick={() => setShowSaveAsTemplate(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-foreground font-medium hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Save as template"
            >
              <Bookmark className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              Save as template
            </button>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-foreground font-medium hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Export to calendar"
            >
              <Calendar className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              Export
            </button>
          </>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        {/* Total Meals Card */}
        <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total meals</p>
              <p className="text-2xl font-medium tabular-nums text-foreground">{mealPlan.meals.length}</p>
            </div>
            <UtensilsCrossed className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
          </div>
        </div>

        {/* Prep Time Card */}
        <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total prep time</p>
              <p className="text-2xl font-medium font-mono tabular-nums text-foreground">{timeline.totalPrepTime}m</p>
            </div>
            <Clock className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
          </div>
        </div>

        {/* Cook Time Card */}
        <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total cook time</p>
              <p className="text-2xl font-medium font-mono tabular-nums text-foreground">{timeline.totalCookTime}m</p>
            </div>
            <Flame className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
          </div>
        </div>

        {/* Avg Calories Card */}
        {nutrition && (
          <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg daily calories</p>
                <p className="text-2xl font-medium tabular-nums text-foreground">{nutrition.avgCalories}</p>
              </div>
              <Flame className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
            </div>
          </div>
        )}
      </div>

      {/* Nutrition Summary */}
      {nutrition && (
        <div className="bg-card rounded-lg border border-border p-6 shadow-sm mb-6">
          <h2 className="text-xl font-medium text-foreground mb-4">Nutrition overview</h2>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Protein (avg/day)</p>
              <p className="text-xl font-medium tabular-nums text-foreground">{nutrition.avgProtein}g</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Carbs (avg/day)</p>
              <p className="text-xl font-medium tabular-nums text-foreground">{nutrition.avgCarbs}g</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Fat (avg/day)</p>
              <p className="text-xl font-medium tabular-nums text-foreground">{nutrition.avgFat}g</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            * Nutrition values are estimates based on recipe data
          </p>
        </div>
      )}

      {/* Weekly Calendar View */}
      <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
        <h2 className="text-xl font-medium text-foreground mb-4">Weekly schedule</h2>

        <div className="space-y-6">
          {sortedDates.map(dateKey => {
            // Entries may carry an optional `[HH:MM]` time prefix in notes
            // (see mealPlanEntry.ts); show timed entries first, chronologically.
            const meals = groupedMeals[dateKey]
              .map((meal) => ({ meal, ...decodeEntryNotes(meal.notes) }))
              .sort((a, b) =>
                compareEntries(
                  { mealType: a.meal.mealType, time: a.time },
                  { mealType: b.meal.mealType, time: b.time }
                )
              );

            return (
              <div key={dateKey} className="border-l border-border pl-4">
                <h3 className="text-base font-medium tabular-nums text-foreground mb-3">
                  {new Date(dateKey + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </h3>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {meals.map(({ meal, time, notes }) => {
                    const config = MEAL_TYPE_CONFIG[resolveMealType(meal.mealType)];
                    const isLeftover = meal.recipe && leftovers[meal.recipe.id] > 1;

                    return (
                      <Link
                        key={meal.id}
                        to={meal.recipe ? `/recipes/${meal.recipe.id}` : '#'}
                        className="block rounded-lg border border-border bg-card p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {/* Meal Type Header */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`h-2 w-2 rounded-full ${config.dot}`} aria-hidden="true" />
                          <span className="text-xs font-medium text-muted-foreground">
                            {config.label}
                          </span>
                          {time && (
                            <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground">
                              <Clock className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                              {formatTimeForDisplay(time)}
                            </span>
                          )}
                          {isLeftover && (
                            <span
                              className="ml-auto text-xs bg-accent/20 text-accent-foreground px-1.5 py-0.5 rounded flex items-center gap-1"
                              title="Recipe appears multiple times this week"
                            >
                              <Recycle className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                            </span>
                          )}
                        </div>

                        {/* Recipe Image */}
                        {meal.recipe?.imageUrl && (
                          <img
                            src={meal.recipe.imageUrl}
                            alt={meal.recipe.title}
                            className="w-full h-24 object-cover rounded mb-2"
                          />
                        )}

                        {/* Recipe Title */}
                        {meal.recipe && (
                          <p className="font-medium text-foreground text-sm line-clamp-2 mb-1">
                            {meal.recipe.title}
                          </p>
                        )}

                        {/* Servings and Time */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{meal.servings} servings</span>
                          {meal.recipe && (meal.recipe.prepTime || meal.recipe.cookTime) && (
                            <span>
                              {(meal.recipe.prepTime || 0) + (meal.recipe.cookTime || 0)} min
                            </span>
                          )}
                        </div>

                        {/* Notes (time prefix already stripped by decodeEntryNotes) */}
                        {notes && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {notes}
                          </p>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leftover Optimization Info */}
      {Object.keys(leftovers).length > 0 && (
        <div className="mt-6 bg-muted border border-border rounded-lg p-4">
          <div>
            <h3 className="font-medium text-foreground mb-1">Meal prep opportunity</h3>
            <p className="text-sm text-muted-foreground">
              {Object.keys(leftovers).length} recipe{Object.keys(leftovers).length !== 1 ? 's' : ''} appear{Object.keys(leftovers).length === 1 ? 's' : ''} multiple times this week. Consider batch
              cooking to save time.
            </p>
          </div>
        </div>
      )}

      {/* Shopping List Integration */}
      <MealPlanShoppingListIntegration mealPlanId={id!} />

      {/* Save as Template Modal */}
      {showSaveAsTemplate && (
        <SaveAsTemplateModal
          mealPlanId={id!}
          mealPlanName={mealPlan.name}
          onClose={() => setShowSaveAsTemplate(false)}
          onSuccess={handleTemplateSaved}
        />
      )}
    </PageShell>
  );
}
