import { useState, useEffect } from 'react';
import { batchCookingApi } from '@/services/api';
import { RecipeBrowserModal } from '@/features/meal-plans/RecipeBrowserModal';
import { PortionCalculator } from './PortionCalculator';
import type { Recipe } from '@nommable/shared';
import { useToastStore } from '@/store/toast.store';
import { Dialog } from '@/components/Dialog';
import { todayLocalDateKey, isTodayOrFuture } from './batchCookingDates';

interface CreateBatchPlanModalProps {
  onClose: () => void;
  onSuccess: () => void;
  prefillData?: {
    recipe?: Recipe;
    suggestedBatches?: number;
    storageRecommendation?: 'refrigerate' | 'freeze' | 'pantry';
    storageDuration?: number;
  };
}

interface FormData {
  recipeId: string;
  name: string;
  description: string;
  cookingDate: string;
  batches: number;
  servingsPerBatch: number;
  storageMethod: 'refrigerate' | 'freeze' | 'pantry';
  storageDuration: number;
  reheatingInstructions: string;
  prepNotes: string;
}

const STORAGE_DURATIONS = {
  refrigerate: 7,
  freeze: 90,
  pantry: 30,
};

const DEFAULT_REHEATING_INSTRUCTIONS = {
  refrigerate: 'Microwave on high for 2-3 minutes, or reheat in oven at 350°F for 15-20 minutes until heated through.',
  freeze: 'Thaw overnight in refrigerator. Microwave on high for 3-4 minutes, or reheat in oven at 350°F for 20-25 minutes until heated through.',
  pantry: 'Heat on stovetop or microwave according to package directions.',
};

export function CreateBatchPlanModal({ onClose, onSuccess, prefillData }: CreateBatchPlanModalProps) {
  const [activeTab, setActiveTab] = useState<'basic' | 'recipe' | 'storage'>('basic');
  const toast = useToastStore();
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(prefillData?.recipe || null);
  const [showRecipeBrowser, setShowRecipeBrowser] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<FormData>({
    recipeId: prefillData?.recipe?.id || '',
    name: prefillData?.recipe ? `Batch Cook: ${prefillData.recipe.title}` : '',
    description: '',
    cookingDate: todayLocalDateKey(),
    batches: prefillData?.suggestedBatches || 2,
    servingsPerBatch: prefillData?.recipe?.servings || 4,
    storageMethod: prefillData?.storageRecommendation || 'freeze',
    storageDuration: prefillData?.storageDuration || STORAGE_DURATIONS.freeze,
    reheatingInstructions: DEFAULT_REHEATING_INSTRUCTIONS[prefillData?.storageRecommendation || 'freeze'],
    prepNotes: '',
  });

  // Update reheating instructions when storage method changes
  useEffect(() => {
    if (!formData.reheatingInstructions ||
        formData.reheatingInstructions === DEFAULT_REHEATING_INSTRUCTIONS.refrigerate ||
        formData.reheatingInstructions === DEFAULT_REHEATING_INSTRUCTIONS.freeze ||
        formData.reheatingInstructions === DEFAULT_REHEATING_INSTRUCTIONS.pantry) {
      setFormData((prev) => ({
        ...prev,
        reheatingInstructions: DEFAULT_REHEATING_INSTRUCTIONS[formData.storageMethod],
        storageDuration: STORAGE_DURATIONS[formData.storageMethod],
      }));
    }
  }, [formData.storageMethod]);

  const handleRecipeSelect = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setFormData((prev) => ({
      ...prev,
      recipeId: recipe.id,
      name: prev.name || `Batch Cook: ${recipe.title}`,
      servingsPerBatch: recipe.servings || 4,
    }));
    setShowRecipeBrowser(false);
    setErrors((prev) => ({ ...prev, recipeId: '' }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.recipeId) {
      newErrors.recipeId = 'Please select a recipe';
    }
    if (!formData.name.trim()) {
      newErrors.name = 'Plan name is required';
    }
    if (!formData.cookingDate) {
      newErrors.cookingDate = 'Cooking date is required';
    } else {
      if (!isTodayOrFuture(formData.cookingDate)) {
        newErrors.cookingDate = 'Cooking date must be today or in the future';
      }
    }
    if (formData.batches < 1 || formData.batches > 20) {
      newErrors.batches = 'Batches must be between 1 and 20';
    }
    if (formData.servingsPerBatch < 1) {
      newErrors.servingsPerBatch = 'Servings per batch must be at least 1';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      await batchCookingApi.create(formData);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Failed to create batch plan:', error);
      toast.error(error.response?.data?.message || 'Failed to create batch cooking plan. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog title="Create Batch Cooking Plan" onClose={onClose} panelClassName="max-w-3xl">
        <div className="p-6">
            {/* Tabs */}
            <div className="flex gap-2 border-b border-border mb-4" role="tablist" aria-label="Plan sections">
              <button
                onClick={() => setActiveTab('basic')}
                className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                  activeTab === 'basic'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Basic Info
              </button>
              <button
                onClick={() => setActiveTab('recipe')}
                className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                  activeTab === 'recipe'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Recipe & Portions
              </button>
              <button
                onClick={() => setActiveTab('storage')}
                className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                  activeTab === 'storage'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Storage & Prep
              </button>
            </div>

          {/* Content */}
          <div>
            {/* Basic Info Tab */}
            {activeTab === 'basic' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Plan Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Sunday Meal Prep"
                    className={`w-full rounded-lg border ${
                      errors.name ? 'border-destructive' : 'border-input'
                    } bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary`}
                  />
                  {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional description of your batch cooking plan"
                    rows={3}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Cooking Date *
                  </label>
                  <input
                    type="date"
                    value={formData.cookingDate}
                    onChange={(e) => setFormData({ ...formData, cookingDate: e.target.value })}
                    min={todayLocalDateKey()}
                    className={`w-full rounded-lg border ${
                      errors.cookingDate ? 'border-destructive' : 'border-input'
                    } bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary`}
                  />
                  {errors.cookingDate && <p className="text-xs text-destructive mt-1">{errors.cookingDate}</p>}
                </div>
              </div>
            )}

            {/* Recipe & Portions Tab */}
            {activeTab === 'recipe' && (
              <div className="space-y-4">
                {/* Recipe Selection */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Recipe *
                  </label>
                  {selectedRecipe ? (
                    <div className="border border-border rounded-lg p-4 bg-accent/5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          {selectedRecipe.imageUrl ? (
                            <img
                              src={selectedRecipe.imageUrl}
                              alt={selectedRecipe.title}
                              className="w-16 h-16 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                              <span className="text-2xl">🍽️</span>
                            </div>
                          )}
                          <div>
                            <h3 className="font-semibold text-foreground">{selectedRecipe.title}</h3>
                            {selectedRecipe.servings && (
                              <p className="text-sm text-muted-foreground">
                                Base recipe: {selectedRecipe.servings} servings
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setShowRecipeBrowser(true)}
                          className="text-sm text-primary hover:underline"
                        >
                          Change Recipe
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowRecipeBrowser(true)}
                      className={`w-full py-4 rounded-lg border-2 border-dashed ${
                        errors.recipeId ? 'border-destructive' : 'border-border hover:border-primary'
                      } bg-accent/5 hover:bg-accent/10 transition-all flex items-center justify-center gap-2 text-muted-foreground hover:text-primary`}
                    >
                      <span className="text-2xl">+</span>
                      Select a Recipe
                    </button>
                  )}
                  {errors.recipeId && <p className="text-xs text-destructive mt-1">{errors.recipeId}</p>}
                </div>

                {/* Portion Calculator */}
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-3">Calculate Portions</h3>
                  <PortionCalculator
                    batches={formData.batches}
                    servingsPerBatch={formData.servingsPerBatch}
                    recipeServings={selectedRecipe?.servings}
                    onChange={(batches, servingsPerBatch) =>
                      setFormData({ ...formData, batches, servingsPerBatch })
                    }
                  />
                  {errors.batches && <p className="text-xs text-destructive mt-1">{errors.batches}</p>}
                  {errors.servingsPerBatch && <p className="text-xs text-destructive mt-1">{errors.servingsPerBatch}</p>}
                </div>
              </div>
            )}

            {/* Storage & Prep Tab */}
            {activeTab === 'storage' && (
              <div className="space-y-4">
                {/* Storage Method */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Storage Method
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['refrigerate', 'freeze', 'pantry'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setFormData({ ...formData, storageMethod: method })}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          formData.storageMethod === method
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="text-2xl mb-2">
                          {method === 'refrigerate' ? '❄️' : method === 'freeze' ? '🧊' : '📦'}
                        </div>
                        <div className="text-sm font-medium capitalize">{method}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Storage Duration */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Storage Duration (days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.storageDuration}
                    onChange={(e) => setFormData({ ...formData, storageDuration: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Recommended: {STORAGE_DURATIONS[formData.storageMethod]} days for {formData.storageMethod}
                  </p>
                </div>

                {/* Reheating Instructions */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Reheating Instructions
                  </label>
                  <textarea
                    value={formData.reheatingInstructions}
                    onChange={(e) => setFormData({ ...formData, reheatingInstructions: e.target.value })}
                    placeholder="How to reheat this meal"
                    rows={4}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>

                {/* Prep Notes */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Prep Notes (Optional)
                  </label>
                  <textarea
                    value={formData.prepNotes}
                    onChange={(e) => setFormData({ ...formData, prepNotes: e.target.value })}
                    placeholder="Any additional prep tips or notes"
                    rows={3}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {activeTab === 'basic' && 'Step 1 of 3: Basic information'}
              {activeTab === 'recipe' && 'Step 2 of 3: Recipe and portions'}
              {activeTab === 'storage' && 'Step 3 of 3: Storage and prep'}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              {activeTab !== 'storage' ? (
                <button
                  onClick={() => {
                    if (activeTab === 'basic') setActiveTab('recipe');
                    else if (activeTab === 'recipe') setActiveTab('storage');
                  }}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Plan'}
                </button>
              )}
            </div>
          </div>
        </div>
      </Dialog>

      {/* Recipe Browser Modal */}
      {showRecipeBrowser && (
        <RecipeBrowserModal
          onClose={() => setShowRecipeBrowser(false)}
          onSelect={handleRecipeSelect}
          mealType="dinner"
        />
      )}
    </>
  );
}

