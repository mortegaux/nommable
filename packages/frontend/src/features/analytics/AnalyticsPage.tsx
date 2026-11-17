import { useState, useEffect } from 'react';
import { analyticsApi } from '@/services/api';
import { Link } from 'react-router-dom';
import { Apple, Moon, Sun, Sunrise, UtensilsCrossed } from 'lucide-react';
import { InfoTooltip, InfoBanner } from '@/components/InfoTooltip';
import { PageHeader } from '@/components/PageHeader';
import { Callout } from '@/components/Callout';

interface RecipeFrequency {
  recipeId: string;
  recipeTitle: string;
  count: number;
  imageUrl?: string;
  categories: string[];
}

interface MealTypeDistribution {
  breakfast: number;
  lunch: number;
  dinner: number;
  snack: number;
}

interface CookingFrequency {
  date: string;
  mealCount: number;
}

interface RecipeVariety {
  totalMeals: number;
  uniqueRecipes: number;
  varietyScore: number;
  mostRepeatedRecipe?: {
    title: string;
    count: number;
  };
}

interface NutritionTrends {
  averageCalories: number;
  averageProtein: number;
  averageCarbs: number;
  averageFat: number;
  averageFiber: number;
  totalMealsAnalyzed: number;
}

interface CategoryPopularity {
  category: string;
  count: number;
  percentage: number;
}

interface AnalyticsSummary {
  totalMealPlans: number;
  totalMeals: number;
  dateRange: {
    earliest: string | null;
    latest: string | null;
  };
  mostCookedRecipes: RecipeFrequency[];
  mealTypeDistribution: MealTypeDistribution;
  cookingFrequency: CookingFrequency[];
  recipeVariety: RecipeVariety;
  nutritionTrends: NutritionTrends;
  categoryPopularity: CategoryPopularity[];
  aiGeneratedRatio: number;
}

interface MealHistoryItem {
  id: string;
  date: string;
  mealType: string;
  servings: number;
  notes?: string;
  recipe: {
    id: string;
    title: string;
    imageUrl?: string;
    categories: string[];
    prepTime?: number;
    cookTime?: number;
  } | null;
}

const MEAL_TYPE_COLORS = {
  breakfast: 'bg-muted text-muted-foreground border-border',
  lunch: 'bg-muted text-muted-foreground border-border',
  dinner: 'bg-muted text-muted-foreground border-border',
  snack: 'bg-muted text-muted-foreground border-border',
};

const MEAL_TYPE_ICONS = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: Moon,
  snack: Apple,
};

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [mealHistory, setMealHistory] = useState<MealHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [summaryResponse, historyResponse] = await Promise.all([
        analyticsApi.getSummary(),
        analyticsApi.getHistory(30),
      ]);
      setAnalytics(summaryResponse.data);
      setMealHistory(historyResponse.data);
    } catch (error: any) {
      console.error('Failed to load analytics:', error);
      setLoadError(
        error?.response?.data?.message ||
          "Couldn't load your analytics. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading analytics</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <PageHeader
          title="Meal analytics"
          subtitle="Insights into your cooking patterns and preferences"
        />
        <Callout
          tone="error"
          role="alert"
          title="Couldn't load analytics"
          className="mx-auto max-w-7xl text-center"
        >
          <p className="mb-6">{loadError}</p>
          <button
            onClick={loadAnalytics}
            className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Retry
          </button>
        </Callout>
      </div>
    );
  }

  if (!analytics || analytics.totalMealPlans === 0) {
    return (
      <div>
        <PageHeader
          title="Meal analytics"
          subtitle="Insights into your cooking patterns and preferences"
        />
        <InfoBanner
          type="tip"
          title="Get started with analytics"
          description={
            <div className="space-y-2">
              <p>Analytics will appear here once you start creating meal plans.</p>
              <p className="text-sm">You'll be able to track:</p>
              <ul className="text-sm list-disc list-inside ml-2 space-y-1">
                <li>Your most cooked recipes and favorites</li>
                <li>Meal type preferences (breakfast, lunch, dinner)</li>
                <li>Cooking frequency and patterns</li>
                <li>Recipe variety and diversity</li>
                <li>Average nutrition across all meals</li>
                <li>Category popularity (Italian, Mexican, etc.)</li>
              </ul>
              <Link
                to="/meal-plans/new"
                className="inline-block mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                Create your first meal plan
              </Link>
            </div>
          }
          className="max-w-7xl mx-auto"
        />
      </div>
    );
  }

  const totalMealTypes = Object.values(analytics.mealTypeDistribution).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto w-full max-w-7xl">
      {/* Header */}
      <PageHeader
        title="Meal analytics"
        titleAdornment={
          <InfoTooltip content="Analytics track your meal planning history, cooking patterns, and nutritional trends. All data is calculated in real-time from your meal plans." />
        }
        subtitle="Insights into your cooking patterns and preferences"
      />

      {/* Info Banner */}
      <Callout tone="info" title="How analytics work" className="mb-6">
        <div className="space-y-1">
          <p>Analytics are calculated from all your meal plans and tracked meals.</p>
          <p className="text-xs mt-1">
            <span className="font-medium">What&apos;s tracked:</span> Recipe frequency • Meal types • Cooking patterns • Nutrition averages • Category preferences
          </p>
        </div>
      </Callout>

      {/* Tabs */}
      <div className="mb-6 border-b border-border">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 font-medium transition-colors border-b ${
              activeTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 font-medium transition-colors border-b ${
              activeTab === 'history'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Meal history
          </button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
                Total meal plans
                <InfoTooltip content="The total number of meal plans you've created. Each plan can contain multiple meals." />
              </div>
              <div className="text-3xl font-medium tabular-nums text-foreground">{analytics.totalMealPlans}</div>
            </div>
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
                Total meals planned
                <InfoTooltip content="The total number of individual meals across all your meal plans. This includes breakfast, lunch, dinner, and snacks." />
              </div>
              <div className="text-3xl font-medium tabular-nums text-foreground">{analytics.totalMeals}</div>
            </div>
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
                Unique recipes
                <InfoTooltip content="The number of different recipes you've used in your meal plans. Repeating recipes don't increase this number." />
              </div>
              <div className="text-3xl font-medium tabular-nums text-foreground">{analytics.recipeVariety.uniqueRecipes}</div>
            </div>
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
                Variety score
                <InfoTooltip content={
                  <div>
                    <p className="mb-2">Measures recipe diversity in your meal plans.</p>
                    <p className="text-xs">Formula: Unique recipes ÷ Total Meals</p>
                    <p className="text-xs mt-1">Higher scores mean more variety. 100% = every meal is a different recipe.</p>
                  </div>
                } />
              </div>
              <div className="text-3xl font-medium tabular-nums text-foreground">
                {formatPercentage(analytics.recipeVariety.varietyScore)}
              </div>
            </div>
          </div>

          {/* Date Range */}
          {analytics.dateRange.earliest && analytics.dateRange.latest && (
            <div className="bg-muted rounded-xl border border-border p-4">
              <div className="flex items-center justify-center gap-4 text-sm">
                <span className="text-muted-foreground">Tracking meals from</span>
                <span className="font-medium font-mono tabular-nums text-foreground">{formatDate(analytics.dateRange.earliest)}</span>
                <span className="text-muted-foreground">to</span>
                <span className="font-medium font-mono tabular-nums text-foreground">{formatDate(analytics.dateRange.latest)}</span>
              </div>
            </div>
          )}

          {/* Meal Type Distribution */}
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-xl font-medium text-foreground mb-4">Meal type distribution</h2>
            <table className="sr-only">
              <caption>Meal type distribution</caption>
              <thead>
                <tr>
                  <th scope="col">Meal type</th>
                  <th scope="col">Meals</th>
                  <th scope="col">Percentage</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(analytics.mealTypeDistribution).map(([type, count]) => (
                  <tr key={type}>
                    <th scope="row" className="capitalize">{type}</th>
                    <td>{count}</td>
                    <td>{totalMealTypes > 0 ? ((count / totalMealTypes) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-4" aria-hidden="true">
              {Object.entries(analytics.mealTypeDistribution).map(([type, count]) => {
                const percentage = totalMealTypes > 0 ? (count / totalMealTypes) * 100 : 0;
                const IconComponent = MEAL_TYPE_ICONS[type as keyof typeof MEAL_TYPE_ICONS];
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <IconComponent className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                        <span className="font-medium text-foreground capitalize">{type}</span>
                      </div>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {count} meal{count !== 1 ? 's' : ''} ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full bg-background rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full bg-primary transition-[width]"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Most Cooked Recipes */}
          {analytics.mostCookedRecipes.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-xl font-medium text-foreground mb-4">Most cooked recipes</h2>
              <div className="space-y-3">
                {analytics.mostCookedRecipes.map((recipe, index) => (
                  <Link
                    key={recipe.recipeId}
                    to={`/recipes/${recipe.recipeId}`}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-medium tabular-nums">
                      {index + 1}
                    </div>
                    {recipe.imageUrl ? (
                      <img
                        src={recipe.imageUrl}
                        alt={recipe.recipeTitle}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                        <UtensilsCrossed className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{recipe.recipeTitle}</div>
                      {recipe.categories.length > 0 && (
                        <div className="text-sm text-muted-foreground">{recipe.categories.join(', ')}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-medium tabular-nums text-foreground">{recipe.count}</div>
                      <div className="text-xs text-muted-foreground">times</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Nutrition Trends */}
          {analytics.nutritionTrends.totalMealsAnalyzed > 0 && (
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-medium text-foreground">Average nutrition per meal</h2>
                <InfoTooltip content={
                  <div>
                    <p className="mb-2">Averages are calculated only from recipes that have nutrition data entered.</p>
                    <p className="text-xs text-muted-foreground">{analytics.nutritionTrends.totalMealsAnalyzed} of {analytics.totalMeals} meals analyzed</p>
                  </div>
                } />
              </div>
              <div className="grid gap-4 md:grid-cols-5">
                <div className="text-center">
                  <div className="text-3xl font-medium tabular-nums text-foreground">
                    {Math.round(analytics.nutritionTrends.averageCalories)}
                  </div>
                  <div className="text-sm text-muted-foreground">Calories</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-medium tabular-nums text-foreground">
                    {Math.round(analytics.nutritionTrends.averageProtein)}g
                  </div>
                  <div className="text-sm text-muted-foreground">Protein</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-medium tabular-nums text-foreground">
                    {Math.round(analytics.nutritionTrends.averageCarbs)}g
                  </div>
                  <div className="text-sm text-muted-foreground">Carbs</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-medium tabular-nums text-foreground">
                    {Math.round(analytics.nutritionTrends.averageFat)}g
                  </div>
                  <div className="text-sm text-muted-foreground">Fat</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-medium tabular-nums text-foreground">
                    {Math.round(analytics.nutritionTrends.averageFiber)}g
                  </div>
                  <div className="text-sm text-muted-foreground">Fiber</div>
                </div>
              </div>
              <div className="mt-4 text-center text-sm text-muted-foreground">
                Based on {analytics.nutritionTrends.totalMealsAnalyzed} meals with nutrition data
              </div>
            </div>
          )}

          {/* Category Popularity */}
          {analytics.categoryPopularity.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-xl font-medium text-foreground mb-4">Popular recipe categories</h2>
              <div className="flex flex-wrap gap-3">
                {analytics.categoryPopularity.map((cat) => (
                  <div
                    key={cat.category}
                    className="px-4 py-2 rounded-full bg-muted border border-border"
                  >
                    <span className="font-medium text-foreground">{cat.category}</span>
                    <span className="ml-2 text-sm tabular-nums text-muted-foreground">
                      {cat.count} ({cat.percentage.toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recipe Variety Insights */}
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-xl font-medium text-foreground mb-4">Recipe variety insights</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                <span className="text-foreground">Total meals planned</span>
                <span className="font-medium tabular-nums text-foreground text-xl">{analytics.recipeVariety.totalMeals}</span>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                <span className="text-foreground">Unique recipes used</span>
                <span className="font-medium tabular-nums text-foreground text-xl">{analytics.recipeVariety.uniqueRecipes}</span>
              </div>
              {analytics.recipeVariety.mostRepeatedRecipe && (
                <div className="p-4 rounded-lg bg-muted border border-border">
                  <div className="text-sm text-muted-foreground mb-1">Most repeated recipe</div>
                  <div className="font-medium text-foreground">{analytics.recipeVariety.mostRepeatedRecipe.title}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Cooked {analytics.recipeVariety.mostRepeatedRecipe.count} times
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* AI Usage */}
          {analytics.aiGeneratedRatio > 0 && (
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-medium text-foreground">AI-assisted planning</h2>
              </div>
              <p className="tabular-nums text-muted-foreground">
                {formatPercentage(analytics.aiGeneratedRatio)} of your meal plans were created with AI assistance
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Meal history Tab */
        <div className="space-y-4">
          {mealHistory.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No meal history available yet.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">Showing your last 30 planned meals</p>
              {mealHistory.map((meal) => (
                <div key={meal.id} className="bg-card rounded-xl border border-border p-4 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-20 text-center">
                      <div className="font-mono text-sm font-medium tabular-nums text-foreground">{formatDate(meal.date)}</div>
                      <div
                        className={`mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border capitalize ${
                          MEAL_TYPE_COLORS[meal.mealType as keyof typeof MEAL_TYPE_COLORS]
                        }`}
                      >
                        {(() => {
                          const IconComponent = MEAL_TYPE_ICONS[meal.mealType as keyof typeof MEAL_TYPE_ICONS];
                          return <IconComponent className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />;
                        })()}
                        {meal.mealType}
                      </div>
                    </div>

                    {meal.recipe ? (
                      <>
                        {meal.recipe.imageUrl ? (
                          <img
                            src={meal.recipe.imageUrl}
                            alt={meal.recipe.title}
                            className="w-20 h-20 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center">
                            <UtensilsCrossed className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                          </div>
                        )}

                        <div className="flex-1">
                          <Link
                            to={`/recipes/${meal.recipe.id}`}
                            className="font-medium text-foreground hover:text-primary transition-colors"
                          >
                            {meal.recipe.title}
                          </Link>
                          {meal.recipe.categories.length > 0 && (
                            <div className="text-sm text-muted-foreground mt-1">
                              {meal.recipe.categories.join(', ')}
                            </div>
                          )}
                          <div className="flex items-center gap-4 mt-2 font-mono text-xs tabular-nums text-muted-foreground">
                            {meal.recipe.prepTime && (
                              <span>Prep: {meal.recipe.prepTime}m</span>
                            )}
                            {meal.recipe.cookTime && (
                              <span>Cook: {meal.recipe.cookTime}m</span>
                            )}
                            <span>Servings: {meal.servings}</span>
                          </div>
                          {meal.notes && (
                            <div className="mt-2 text-sm text-muted-foreground">
                              "{meal.notes}"
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 text-muted-foreground">No recipe assigned</div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
