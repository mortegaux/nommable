import { useState, useEffect } from 'react';
import { batchCookingApi, recipeApi } from '@/services/api';
import { PortionCalculator } from './PortionCalculator';
import type { Recipe } from '@nommable/shared';
import { useToastStore } from '@/store/toast.store';
import { Dialog } from '@/components/Dialog';
import { RestaurantIcon } from '@/components/icons/MaterialIcon';
import { Check, Search, Tag, ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';
import { todayLocalDateKey, parseLocalDate, isTodayOrFuture } from './batchCookingDates';

interface CreateBatchSessionModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

// Batch-cooking tag convention: these are the tags the backend suggestion
// scorer rewards, with 'Freezer-Friendly' carrying the most weight.
// Tag bootstrapping applies exactly 'Freezer-Friendly'.
const BATCH_TAGS = ['Freezer-Friendly', 'One-Pot', 'Make-Ahead'];
const BOOTSTRAP_TAG = 'Freezer-Friendly';

const STORAGE_DURATIONS: Record<'refrigerate' | 'freeze' | 'pantry', number> = {
  refrigerate: 7,
  freeze: 90,
  pantry: 30,
};

const STORAGE_LABELS: Record<'refrigerate' | 'freeze' | 'pantry', string> = {
  refrigerate: 'Fridge',
  freeze: 'Freezer',
  pantry: 'Pantry',
};

interface RecipePortions {
  batches: number;
  servingsPerBatch: number;
}

interface Suggestion {
  recipe: Recipe;
  batchFriendlyScore: number;
  reasons: string[];
  suggestedBatches: number;
  storageRecommendation: 'refrigerate' | 'freeze' | 'pantry';
  storageDuration: number;
}

type Step = 'pick' | 'review' | 'save';

const STEPS: { id: Step; label: string }[] = [
  { id: 'pick', label: 'Pick recipes' },
  { id: 'review', label: 'Review & portions' },
  { id: 'save', label: 'Save' },
];

export function CreateBatchSessionModal({ onClose, onSuccess }: CreateBatchSessionModalProps) {
  const toast = useToastStore();
  const [step, setStep] = useState<Step>('pick');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [portions, setPortions] = useState<Record<string, RecipePortions>>({});
  const [tagging, setTagging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [sessionName, setSessionName] = useState('Batch Cook');
  const [cookingDate, setCookingDate] = useState(todayLocalDateKey());
  const [storageMethod, setStorageMethod] = useState<'refrigerate' | 'freeze' | 'pantry'>('freeze');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [recipesResponse, suggestionsResponse] = await Promise.all([
        recipeApi.getAll(),
        batchCookingApi.getSuggestions(),
      ]);
      setRecipes(recipesResponse.data || []);
      setSuggestions(suggestionsResponse.data || []);
    } catch (error) {
      console.error('Failed to load recipes:', error);
      setRecipes([]);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const hasBatchTag = (recipe: Recipe) =>
    (recipe.tags || []).some((tag) => BATCH_TAGS.includes(tag));

  const taggedCount = recipes.filter(hasBatchTag).length;

  const filteredRecipes = recipes.filter((recipe) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      recipe.title.toLowerCase().includes(q) ||
      recipe.description?.toLowerCase().includes(q)
    );
  });

  const selectedRecipes = recipes.filter((r) => selected.has(r.id));

  const toggleSelect = (recipe: Recipe) => {
    const isSelected = selected.has(recipe.id);
    const next = new Set(selected);
    if (isSelected) {
      next.delete(recipe.id);
    } else {
      next.add(recipe.id);
      if (!portions[recipe.id]) {
        setPortions((p) => ({
          ...p,
          [recipe.id]: { batches: 2, servingsPerBatch: recipe.servings || 4 },
        }));
      }
    }
    setSelected(next);
    setErrors((prev) => ({ ...prev, selection: '' }));
  };

  const addSuggestion = (suggestion: Suggestion) => {
    if (!selected.has(suggestion.recipe.id)) {
      toggleSelect(suggestion.recipe);
    }
  };

  const handleApplyTag = async () => {
    if (selected.size === 0) return;
    try {
      setTagging(true);
      const ids = Array.from(selected);
      const response = await recipeApi.bulkUpdate(ids, { tags: [BOOTSTRAP_TAG] });
      const count = response.data?.updatedCount ?? ids.length;
      toast.success(
        count === 1
          ? `Tagged 1 recipe as "${BOOTSTRAP_TAG}".`
          : `Tagged ${count} recipes as "${BOOTSTRAP_TAG}".`
      );
      await loadData();
    } catch (error) {
      console.error('Failed to apply batch-cooking tag:', error);
      toast.error('Failed to tag recipes. Please try again.');
    } finally {
      setTagging(false);
    }
  };

  const validateReview = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (selected.size === 0) {
      newErrors.selection = 'Select at least one recipe to continue';
    }
    if (!sessionName.trim()) {
      newErrors.sessionName = 'Session name is required';
    }
    if (!cookingDate) {
      newErrors.cookingDate = 'Cooking date is required';
    } else {
      if (!isTodayOrFuture(cookingDate)) {
        newErrors.cookingDate = 'Cooking date must be today or in the future';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 'pick') {
      if (selected.size === 0) {
        setErrors({ selection: 'Select at least one recipe to continue' });
        return;
      }
      setStep('review');
    } else if (step === 'review') {
      if (validateReview()) {
        setStep('save');
      }
    }
  };

  const handleBack = () => {
    if (step === 'review') setStep('pick');
    else if (step === 'save') setStep('review');
  };

  const handleSave = async () => {
    if (selectedRecipes.length === 0) return;
    try {
      setSaving(true);
      for (const recipe of selectedRecipes) {
        const config = portions[recipe.id] || { batches: 2, servingsPerBatch: recipe.servings || 4 };
        await batchCookingApi.create({
          recipeId: recipe.id,
          name:
            selectedRecipes.length > 1
              ? `${sessionName.trim()} - ${recipe.title}`
              : sessionName.trim(),
          cookingDate,
          batches: config.batches,
          servingsPerBatch: config.servingsPerBatch,
          storageMethod,
          storageDuration: STORAGE_DURATIONS[storageMethod],
        });
      }
      toast.success(
        selectedRecipes.length > 1
          ? `Created ${selectedRecipes.length} batch cooking plans.`
          : 'Batch cooking plan created.'
      );
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Failed to create batch cooking session:', error);
      toast.error(
        error.response?.data?.message || 'Failed to create batch cooking session. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const renderRecipeRow = (recipe: Recipe) => {
    const isSelected = selected.has(recipe.id);
    return (
      <button
        key={recipe.id}
        type="button"
        onClick={() => toggleSelect(recipe)}
        aria-pressed={isSelected}
        className={`text-left w-full flex items-center gap-3 border rounded-lg p-3 transition-all focus:outline-none focus:ring-2 focus:ring-primary ${
          isSelected
            ? 'border-primary bg-primary/5'
            : 'border-border bg-accent/5 hover:border-primary/50 hover:bg-accent/10'
        }`}
      >
        <span
          className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            isSelected ? 'bg-primary border-primary' : 'border-border bg-background'
          }`}
        >
          {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
        </span>
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt={recipe.title}
            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
          />
        ) : (
          <span className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            <RestaurantIcon size={24} className="text-muted-foreground" />
          </span>
        )}
        <span className="flex-1 min-w-0">
          <span className="block font-medium text-foreground truncate">{recipe.title}</span>
          <span className="block text-xs text-muted-foreground">
            {recipe.servings ? `${recipe.servings} servings` : 'Servings n/a'}
            {recipe.cookTime ? ` · ${recipe.cookTime} min` : ''}
          </span>
        </span>
        {hasBatchTag(recipe) && (
          <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs bg-secondary/50 text-secondary-foreground">
            Batch-ready
          </span>
        )}
      </button>
    );
  };

  return (
    <Dialog title="New Batch Cook" onClose={onClose} panelClassName="max-w-3xl">
      <div className="p-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6" aria-label="Session setup progress">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${
                    i < stepIndex
                      ? 'bg-primary text-primary-foreground'
                      : i === stepIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i < stepIndex ? <Check className="w-4 h-4" /> : i + 1}
                </span>
                <span
                  className={`text-sm font-medium ${
                    i === stepIndex ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="min-h-[280px]">
          {/* STEP 1: PICK RECIPES */}
          {step === 'pick' && (
            <div className="space-y-4">
              {/* Tag bootstrapping: one-time setup when nothing is tagged */}
              {!loading && taggedCount === 0 && (
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 dark:bg-amber-950/30 dark:border-amber-800">
                  <div className="flex items-start gap-3">
                    <Tag className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-foreground">
                        No recipes tagged for batch cooking yet — select recipes to tag
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Pick recipes below and apply the "{BOOTSTRAP_TAG}" tag. They'll show up in
                        batch cooking suggestions from now on.
                      </p>
                      <button
                        type="button"
                        onClick={handleApplyTag}
                        disabled={selected.size === 0 || tagging}
                        className="mt-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {tagging
                          ? 'Applying tag...'
                          : selected.size === 0
                          ? `Apply "${BOOTSTRAP_TAG}" tag`
                          : `Apply "${BOOTSTRAP_TAG}" tag to ${selected.size} selected`}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tag suggestions as a secondary aid */}
              {!loading && taggedCount > 0 && suggestions.length > 0 && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <p className="text-sm font-medium text-foreground">
                      Suggested for batch cooking ({suggestions.length})
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.slice(0, 6).map((suggestion) => (
                      <button
                        key={suggestion.recipe.id}
                        type="button"
                        onClick={() => addSuggestion(suggestion)}
                        disabled={selected.has(suggestion.recipe.id)}
                        className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors bg-background border border-border hover:border-primary disabled:opacity-50 disabled:cursor-default"
                        title={suggestion.reasons.slice(0, 2).join(' · ')}
                      >
                        {selected.has(suggestion.recipe.id) ? '✓ ' : '+ '}
                        {suggestion.recipe.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search recipes..."
                  aria-label="Search recipes"
                  className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {selected.size > 0 && (
                <p className="text-sm text-muted-foreground">
                  {selected.size} recipe{selected.size === 1 ? '' : 's'} selected
                </p>
              )}
              {errors.selection && <p className="text-xs text-destructive">{errors.selection}</p>}

              {/* Recipe list */}
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading recipes...</div>
              ) : filteredRecipes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No recipes found. Try adjusting your search.
                </div>
              ) : (
                <div className="space-y-2">{filteredRecipes.map(renderRecipeRow)}</div>
              )}
            </div>
          )}

          {/* STEP 2: REVIEW & PORTIONS */}
          {step === 'review' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Session Name *
                  </label>
                  <input
                    type="text"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="e.g., Sunday Meal Prep"
                    className={`w-full rounded-lg border ${
                      errors.sessionName ? 'border-destructive' : 'border-input'
                    } bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary`}
                  />
                  {errors.sessionName && (
                    <p className="text-xs text-destructive mt-1">{errors.sessionName}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Cooking Date *
                  </label>
                  <input
                    type="date"
                    value={cookingDate}
                    onChange={(e) => setCookingDate(e.target.value)}
                    min={todayLocalDateKey()}
                    className={`w-full rounded-lg border ${
                      errors.cookingDate ? 'border-destructive' : 'border-input'
                    } bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary`}
                  />
                  {errors.cookingDate && (
                    <p className="text-xs text-destructive mt-1">{errors.cookingDate}</p>
                  )}
                </div>
              </div>

              {/* Storage method */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Storage Method
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['refrigerate', 'freeze', 'pantry'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setStorageMethod(method)}
                      aria-pressed={storageMethod === method}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        storageMethod === method
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="text-xl mb-1">
                        {method === 'refrigerate' ? '❄️' : method === 'freeze' ? '🧊' : '📦'}
                      </div>
                      <div className="text-sm font-medium capitalize">{STORAGE_LABELS[method]}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Per-recipe portions */}
              {selected.size === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-3">
                    You removed every recipe from this session.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep('pick')}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                  >
                    Pick Recipes
                  </button>
                </div>
              ) : (
                selectedRecipes.map((recipe) => (
                  <div key={recipe.id} className="border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        {recipe.imageUrl ? (
                          <img
                            src={recipe.imageUrl}
                            alt={recipe.title}
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <RestaurantIcon size={20} className="text-muted-foreground" />
                          </span>
                        )}
                        <h4 className="font-semibold text-foreground">{recipe.title}</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleSelect(recipe)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        title="Remove from session"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <PortionCalculator
                      batches={portions[recipe.id]?.batches ?? 2}
                      servingsPerBatch={portions[recipe.id]?.servingsPerBatch ?? recipe.servings ?? 4}
                      recipeServings={recipe.servings}
                      onChange={(batches, servingsPerBatch) =>
                        setPortions((p) => ({ ...p, [recipe.id]: { batches, servingsPerBatch } }))
                      }
                    />
                  </div>
                ))
              )}
            </div>
          )}

          {/* STEP 3: SAVE / CONFIRM */}
          {step === 'save' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-accent/10 border border-border space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Session</span>
                  <span className="font-medium text-foreground">{sessionName.trim()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cooking date</span>
                  <span className="font-medium text-foreground">
                    {parseLocalDate(cookingDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Storage</span>
                  <span className="font-medium text-foreground capitalize">
                    {STORAGE_LABELS[storageMethod]} ({STORAGE_DURATIONS[storageMethod]} days)
                  </span>
                </div>
              </div>

              {selectedRecipes.map((recipe) => {
                const config = portions[recipe.id] || {
                  batches: 2,
                  servingsPerBatch: recipe.servings || 4,
                };
                return (
                  <div
                    key={recipe.id}
                    className="flex items-center gap-3 border border-border rounded-lg p-3"
                  >
                    {recipe.imageUrl ? (
                      <img
                        src={recipe.imageUrl}
                        alt={recipe.title}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <span className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <RestaurantIcon size={24} className="text-muted-foreground" />
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{recipe.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {config.batches} batch{config.batches === 1 ? '' : 'es'} ×{' '}
                        {config.servingsPerBatch} servings ={' '}
                        {config.batches * config.servingsPerBatch} total servings
                      </p>
                    </div>
                  </div>
                );
              })}

              <p className="text-sm text-muted-foreground">
                This will create{' '}
                {selectedRecipes.length === 1 ? '1 plan' : `${selectedRecipes.length} plans`}, one
                per recipe. You can edit each plan from the Plans tab afterwards.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-between items-center mt-4">
          <div className="text-sm text-muted-foreground">
            Step {stepIndex + 1} of {STEPS.length}: {STEPS[stepIndex].label}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            {step !== 'pick' && (
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            {step !== 'save' ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving
                  ? 'Creating...'
                  : selectedRecipes.length > 1
                  ? `Create ${selectedRecipes.length} Plans`
                  : 'Create Plan'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
