import { useState } from 'react';
import { Apple, BookOpen, Check, Clock, Loader2, Moon, RefreshCw, Shuffle, Sun, Sunrise, UtensilsCrossed, X, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { mealPlanApi } from '@/services/api';
import { RecipeBrowserModal } from './RecipeBrowserModal';
import { useConfirmStore } from '@/store/confirm.store';
import type { MealPlanPreview, MealSuggestion, Recipe } from '@nommable/shared';

interface MealPlanPreviewModalProps {
  preview: MealPlanPreview;
  onClose: () => void;
  onReplaceMeal: (date: string, mealType: string) => void;
  onManualSelect: (date: string, mealType: string, recipe: Recipe) => void;
}

function MealTypeIcon({ mealType }: { mealType: string }) {
  const Icon =
    mealType === 'breakfast' ? Sunrise
    : mealType === 'lunch' ? Sun
    : mealType === 'dinner' ? Moon
    : mealType === 'snack' ? Apple
    : UtensilsCrossed;
  return <Icon className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />;
}

export function MealPlanPreviewModal({ preview, onClose, onReplaceMeal, onManualSelect }: MealPlanPreviewModalProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [showRecipeBrowser, setShowRecipeBrowser] = useState(false);
  const [browsingFor, setBrowsingFor] = useState<{ date: string; mealType: string } | null>(null);
  const confirm = useConfirmStore((s) => s.confirm);
  const [showBatchMenu, setShowBatchMenu] = useState(false);

  // Group meals by date
  const mealsByDate = preview.mealSuggestions.reduce((acc, meal) => {
    if (!acc[meal.date]) {
      acc[meal.date] = [];
    }
    acc[meal.date].push(meal);
    return acc;
  }, {} as Record<string, MealSuggestion[]>);

  const sortedDates = Object.keys(mealsByDate).sort();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleBrowseRecipes = (date: string, mealType: string) => {
    setBrowsingFor({ date, mealType });
    setShowRecipeBrowser(true);
  };

  const handleRecipeSelect = (recipe: Recipe) => {
    if (!browsingFor) return;

    // Commit the manual pick directly. (Previously this also called
    // onReplaceMeal, which fired an AI regeneration that raced and
    // overwrote the user's exact choice with a different recipe.)
    onManualSelect(browsingFor.date, browsingFor.mealType, recipe);

    setShowRecipeBrowser(false);
    setBrowsingFor(null);
  };

  const handleReplaceAllMealType = async (mealType: string) => {
    const ok = await confirm({
      title: `Replace all ${mealType}s?`,
      message: `Replace every ${mealType} in this preview with new AI suggestions? Your manual picks for ${mealType} will be lost.`,
      confirmLabel: 'Replace all',
    });
    if (!ok) return;

    setShowBatchMenu(false);

    // Get all meals of this type
    const mealsToReplace = preview.mealSuggestions.filter((m) => m.mealType === mealType);

    // Replace each one
    for (const meal of mealsToReplace) {
      await onReplaceMeal(meal.date, meal.mealType);
    }
  };

  const handleShuffleMeals = async () => {
    const ok = await confirm({
      title: 'Shuffle all meals?',
      message: 'Randomly reorder all meal suggestions in this preview?',
      confirmLabel: 'Shuffle',
      danger: false,
    });
    if (!ok) return;

    setShowBatchMenu(false);

    // Shuffle meal suggestions
    const shuffled = [...preview.mealSuggestions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Update preview
    (preview as any).mealSuggestions = shuffled;

    // Force re-render
    setError('');
  };

  const handleCommit = async () => {
    setLoading(true);
    setError('');

    try {
      const request: any = {
        previewId: preview.previewId,
        name: planName.trim() || `Meal Plan - ${formatDate(sortedDates[0])}`,
        description: planDescription.trim() || undefined,
        mealSuggestions: preview.mealSuggestions, // Include preview data
      };

      const response = await mealPlanApi.commitPreview(request);
      const mealPlanId = response.data.id;

      onClose();
      navigate(`/meal-plans/${mealPlanId}`);
    } catch (err: any) {
      console.error('Failed to commit meal plan:', err);
      setError(err.response?.data?.error || 'Failed to create meal plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-medium leading-tight text-balance text-foreground">Review your meal plan</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {preview.mealSuggestions.length} meals • {preview.context.totalRecipesAvailable} recipes available
                {preview.context.pantryIngredientCount > 0 && ` • ${preview.context.pantryIngredientCount} pantry items`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Batch Operations Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowBatchMenu(!showBatchMenu)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium text-foreground hover:bg-accent transition-colors"
                  title="Batch operations"
                >
                  <Zap className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  Batch
                </button>
                {showBatchMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-lg z-10">
                    <div className="p-2 space-y-1">
                      <button
                        onClick={() => handleReplaceAllMealType('breakfast')}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent text-sm text-foreground transition-colors flex items-center gap-2"
                      >
                        <Sunrise className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                        Replace all breakfasts
                      </button>
                      <button
                        onClick={() => handleReplaceAllMealType('lunch')}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent text-sm text-foreground transition-colors flex items-center gap-2"
                      >
                        <Sun className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                        Replace all lunches
                      </button>
                      <button
                        onClick={() => handleReplaceAllMealType('dinner')}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent text-sm text-foreground transition-colors flex items-center gap-2"
                      >
                        <Moon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                        Replace all dinners
                      </button>
                      <button
                        onClick={() => handleReplaceAllMealType('snack')}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent text-sm text-foreground transition-colors flex items-center gap-2"
                      >
                        <Apple className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                        Replace all snacks
                      </button>
                      <div className="border-t border-border my-1"></div>
                      <button
                        onClick={handleShuffleMeals}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent text-sm text-foreground transition-colors flex items-center gap-2"
                      >
                        <Shuffle className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                        Shuffle all meals
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto min-h-0 flex-1">
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
              {error}
            </div>
          )}

          {/* Plan Details */}
          <div className="space-y-3">
            <div>
              <label htmlFor="planName" className="block text-sm font-medium text-foreground mb-2">
                Meal plan name
              </label>
              <input
                id="planName"
                type="text"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder={`Meal Plan - ${formatDate(sortedDates[0])}`}
                className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="planDescription" className="block text-sm font-medium text-foreground mb-2">
                Description (optional)
              </label>
              <textarea
                id="planDescription"
                value={planDescription}
                onChange={(e) => setPlanDescription(e.target.value)}
                placeholder="Add notes about this meal plan"
                rows={2}
                className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          </div>

          {/* Meal Grid */}
          <div className="space-y-4">
            {sortedDates.map((date) => (
              <div key={date} className="bg-muted rounded-lg p-4">
                <h3 className="text-base font-medium tabular-nums text-foreground mb-3">
                  {formatDate(date)}
                </h3>
                <div className="grid gap-3">
                  {mealsByDate[date]
                    .sort((a, b) => {
                      const order = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
                      return order[a.mealType as keyof typeof order] - order[b.mealType as keyof typeof order];
                    })
                    .map((meal, idx) => (
                      <div
                        key={idx}
                        className="bg-card border border-border rounded-lg p-4 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <MealTypeIcon mealType={meal.mealType} />
                              <span className="text-sm font-medium text-muted-foreground capitalize">
                                {meal.mealType}
                              </span>
                              {meal.suggestion.type === 'existing' ? (
                                <span className="text-xs text-muted-foreground">
                                  Your recipe
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  New recipe
                                </span>
                              )}
                            </div>
                            <h4 className="text-base font-medium text-foreground mb-1">
                              {meal.suggestion.recipe.title}
                            </h4>
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                              {meal.suggestion.recipe.description}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              {meal.suggestion.recipe.servings && (
                                <span className="inline-flex items-center gap-1">
                                  <UtensilsCrossed className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                                  {meal.suggestion.recipe.servings} servings
                                </span>
                              )}
                              {meal.suggestion.recipe.cookTime && (
                                <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                                  <Clock className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                                  {meal.suggestion.recipe.cookTime} min
                                </span>
                              )}
                              {meal.suggestion.matchScore !== undefined && meal.suggestion.matchScore > 0 && (
                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                  <Check className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                                  {Math.round(meal.suggestion.matchScore * 100)}% ingredients available
                                </span>
                              )}
                              {meal.suggestion.daysSinceLastUsed !== null && meal.suggestion.daysSinceLastUsed !== undefined && (
                                <span>
                                  Last used {meal.suggestion.daysSinceLastUsed} days ago
                                </span>
                              )}
                              {meal.suggestion.daysSinceLastUsed === null && meal.suggestion.type === 'existing' && (
                                <span className="text-muted-foreground">Never used</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleBrowseRecipes(meal.date, meal.mealType)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-medium text-foreground hover:bg-accent transition-colors whitespace-nowrap"
                              title="Choose from your recipes"
                            >
                              <BookOpen className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                              Browse
                            </button>
                            <button
                              onClick={() => onReplaceMeal(meal.date, meal.mealType)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-medium text-foreground hover:bg-accent transition-colors whitespace-nowrap"
                              title="Generate new suggestion with AI"
                            >
                              <RefreshCw className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                              Replace
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">{preview.mealSuggestions.length}</span> meals ready to add
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-6 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCommit}
              disabled={loading}
              className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                  Creating
                </>
              ) : (
                <>
                  Create meal plan
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Recipe Browser Modal */}
      {showRecipeBrowser && browsingFor && (
        <RecipeBrowserModal
          onClose={() => {
            setShowRecipeBrowser(false);
            setBrowsingFor(null);
          }}
          onSelect={handleRecipeSelect}
          mealType={browsingFor.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack'}
        />
      )}
    </div>
  );
}
