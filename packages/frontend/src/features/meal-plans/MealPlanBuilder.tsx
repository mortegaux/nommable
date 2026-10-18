import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Clock } from 'lucide-react';
import { mealPlanApi, recipeApi } from '@/services/api';
import type { Recipe, MealPlanRecipeCreateDto } from '@nommable/shared';
import { MEAL_TYPES, compareEntries, encodeEntryNotes, type MealType } from './mealPlanEntry';
import { Callout } from '@/components/Callout';

/**
 * A single recipe placement on a day. Local to the builder — the backend
 * stores these as MealPlanRecipe rows (which have no `time` column), so the
 * optional `time` is persisted via encodeEntryNotes into the `notes` field.
 * A day can hold any number of entries (mains, sides, desserts).
 */
interface PlannedMealEntry {
  clientId: string;
  date: Date;
  mealType: MealType;
  recipe: Recipe;
  servings: number;
  notes?: string;
  time?: string; // "HH:MM", optional
}

let entrySeq = 0;
const nextClientId = () => `entry-${Date.now()}-${entrySeq++}`;

// Local-date key (no TZ shift) for matching entries to day cards.
const toLocalDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function MealPlanBuilder() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Meal plan metadata
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  // Calendar state
  const [weekDates, setWeekDates] = useState<Date[]>([]);
  const [entries, setEntries] = useState<PlannedMealEntry[]>([]);

  // Recipe selection
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showRecipeSelector, setShowRecipeSelector] = useState(false);

  // Initialize week dates
  useEffect(() => {
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      dates.push(date);
    }
    setWeekDates(dates);
  }, [startDate]);

  // Load recipes
  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    try {
      const response = await recipeApi.getAll();
      setRecipes(response.data);
    } catch (error) {
      console.error('Failed to load recipes:', error);
    }
  };

  const getDayEntries = (date: Date): PlannedMealEntry[] => {
    const key = toLocalDateKey(date);
    return entries
      .filter((e) => toLocalDateKey(e.date) === key)
      .sort(compareEntries);
  };

  const updateEntry = (clientId: string, patch: Partial<PlannedMealEntry>) => {
    setEntries((prev) => prev.map((e) => (e.clientId === clientId ? { ...e, ...patch } : e)));
  };

  const removeEntry = (clientId: string) => {
    setEntries((prev) => prev.filter((e) => e.clientId !== clientId));
  };

  const handleAddRecipe = (recipe: Recipe) => {
    if (!selectedDate) return;

    // Always append — a day can hold multiple recipes (mains, sides, desserts).
    setEntries((prev) => [
      ...prev,
      {
        clientId: nextClientId(),
        date: selectedDate,
        mealType: 'dinner',
        recipe,
        servings: recipe.servings || 1,
        time: undefined,
      },
    ]);

    setShowRecipeSelector(false);
    setSelectedDate(null);
    setSearchQuery('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Please enter a meal plan name');
      return;
    }

    if (entries.length === 0) {
      setError('Please add at least one meal to your plan');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const endDate = new Date(weekDates[weekDates.length - 1]);

      // The backend stores meals as a plain array with no per-slot limit, so
      // multiple entries per day are sent as-is. `time` rides in `notes`.
      const mealData: MealPlanRecipeCreateDto[] = entries.map((entry) => ({
        recipeId: entry.recipe.id,
        date: entry.date,
        mealType: entry.mealType,
        servings: entry.servings,
        notes: encodeEntryNotes(entry.time, entry.notes),
      }));

      await mealPlanApi.create({
        name,
        description,
        startDate,
        endDate,
        meals: mealData,
      });

      navigate('/meal-plans');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create meal plan');
    } finally {
      setLoading(false);
    }
  };

  const filteredRecipes = recipes.filter(
    (recipe) =>
      recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recipe.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddClick = (date: Date) => {
    setSelectedDate(date);
    setShowRecipeSelector(true);
  };

  const selectedDateLabel = selectedDate
    ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    : '';

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Create Meal Plan</h1>
          <p className="text-muted-foreground mt-1">Add as many recipes as you like to each day</p>
        </div>
        <button
          onClick={() => navigate('/meal-plans')}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cancel and return to meal plans"
        >
          Cancel
        </button>
      </div>

      {error && (
        <Callout tone="error" role="alert" className="mb-6">
          {error}
        </Callout>
      )}

      {/* Meal Plan Info Form */}
      <div className="mb-6 bg-card rounded-lg border border-border p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground mb-4">Meal Plan Details</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1">
              Plan Name <span className="text-destructive">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., Weekly Meal Plan"
              aria-required="true"
            />
          </div>
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-foreground mb-1">
              Start Date
            </label>
            <input
              id="startDate"
              type="date"
              value={toLocalDateKey(startDate)}
              onChange={(e) => setStartDate(new Date(e.target.value + 'T00:00:00'))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="description" className="block text-sm font-medium text-foreground mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Optional notes about this meal plan"
            />
          </div>
        </div>
      </div>

      {/* Days: vertical list, multiple recipes per day */}
      <div className="mb-6 bg-card rounded-lg border border-border p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Days</h2>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {entries.length} {entries.length === 1 ? 'meal' : 'meals'} planned
          </p>
        </div>

        <div className="space-y-3">
          {weekDates.map((date) => {
            const key = toLocalDateKey(date);
            const dayEntries = getDayEntries(date);
            return (
              <div key={key} className="rounded-lg border border-border bg-background overflow-hidden">
                <div className="flex items-center justify-between gap-2 bg-muted/40 px-4 py-2.5">
                  <div>
                    <span className="font-semibold text-foreground">
                      {date.toLocaleDateString('en-US', { weekday: 'long' })}
                    </span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {dayEntries.length > 0 && (
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        {dayEntries.length} {dayEntries.length === 1 ? 'meal' : 'meals'}
                      </span>
                    )}
                    <button
                      onClick={() => handleAddClick(date)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
                      aria-label={`Add recipe to ${date.toLocaleDateString()}`}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Add recipe
                    </button>
                  </div>
                </div>

                {dayEntries.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-muted-foreground">
                    Nothing planned yet — add a main, sides, or dessert.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {dayEntries.map((entry) => {
                      const typeConfig = MEAL_TYPES.find((t) => t.type === entry.mealType);
                      return (
                        <div key={entry.clientId} className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            {entry.recipe.imageUrl && (
                              <img
                                src={entry.recipe.imageUrl}
                                alt=""
                                className="w-11 h-11 rounded object-cover shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-[140px]">
                              <p className="font-medium text-foreground text-sm leading-tight">
                                {entry.recipe.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {entry.servings} serving{entry.servings === 1 ? '' : 's'}
                              </p>
                            </div>

                            <select
                              value={entry.mealType}
                              onChange={(e) =>
                                updateEntry(entry.clientId, { mealType: e.target.value as MealType })
                              }
                              className={`rounded-md border px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary ${typeConfig?.badge ?? ''}`}
                              aria-label={`Meal type for ${entry.recipe.title}`}
                            >
                              {MEAL_TYPES.map((t) => (
                                <option key={t.type} value={t.type}>
                                  {t.label}
                                </option>
                              ))}
                            </select>

                            <div className="relative">
                              <Clock
                                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <input
                                type="time"
                                value={entry.time ?? ''}
                                onChange={(e) =>
                                  updateEntry(entry.clientId, { time: e.target.value || undefined })
                                }
                                className="rounded-md border border-input bg-background pl-8 pr-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                aria-label={`Time for ${entry.recipe.title} (optional)`}
                              />
                            </div>

                            <input
                              type="number"
                              min={1}
                              value={entry.servings}
                              onChange={(e) =>
                                updateEntry(entry.clientId, {
                                  servings: Math.max(1, parseInt(e.target.value, 10) || 1),
                                })
                              }
                              className="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                              aria-label={`Servings for ${entry.recipe.title}`}
                            />

                            <button
                              onClick={() => removeEntry(entry.clientId)}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive"
                              aria-label={`Remove ${entry.recipe.title}`}
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>

                          <input
                            type="text"
                            value={entry.notes ?? ''}
                            onChange={(e) =>
                              updateEntry(entry.clientId, { notes: e.target.value || undefined })
                            }
                            placeholder="Notes (optional)"
                            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            aria-label={`Notes for ${entry.recipe.title}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recipe Selector Modal */}
      {showRecipeSelector && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowRecipeSelector(false);
            setSelectedDate(null);
            setSearchQuery('');
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="recipe-selector-title"
        >
          <div
            className="bg-card rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-border">
              <h3 id="recipe-selector-title" className="text-lg font-semibold text-foreground mb-4">
                Add recipe — {selectedDateLabel}
              </h3>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search recipes..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
                aria-label="Search recipes"
              />
            </div>
            <div className="overflow-y-auto max-h-[60vh] p-4">
              {filteredRecipes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No recipes found. Try a different search term.
                </div>
              ) : (
                <div className="grid gap-3">
                  {filteredRecipes.map((recipe) => (
                    <button
                      key={recipe.id}
                      onClick={() => handleAddRecipe(recipe)}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background hover:bg-accent hover:border-primary/30 transition-all text-left focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {recipe.imageUrl && (
                        <img
                          src={recipe.imageUrl}
                          alt={recipe.title}
                          className="w-16 h-16 object-cover rounded"
                        />
                      )}
                      <div className="flex-1">
                        <div className="font-medium text-foreground">{recipe.title}</div>
                        {recipe.description && (
                          <div className="text-sm text-muted-foreground line-clamp-2">
                            {recipe.description}
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          {recipe.prepTime && <span>{recipe.prepTime}m prep</span>}
                          {recipe.cookTime && <span>{recipe.cookTime}m cook</span>}
                          {recipe.difficulty && (
                            <span className="capitalize">{recipe.difficulty}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => navigate('/meal-plans')}
          className="px-6 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading || !name.trim() || entries.length === 0}
          className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          {loading ? 'Creating...' : 'Create Meal Plan'}
        </button>
      </div>
    </div>
  );
}
