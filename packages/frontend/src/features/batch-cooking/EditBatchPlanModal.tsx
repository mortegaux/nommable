import { useState } from 'react';
import { batchCookingApi } from '@/services/api';
import { PortionCalculator } from './PortionCalculator';
import { useToastStore } from '@/store/toast.store';
import { Dialog } from '@/components/Dialog';

interface Recipe {
  id: string;
  title: string;
  imageUrl?: string;
  servings?: number;
}

interface BatchCookingPlan {
  id: string;
  name: string;
  description?: string;
  cookingDate: string;
  batches: number;
  servingsPerBatch: number;
  storageMethod: 'refrigerate' | 'freeze' | 'pantry';
  storageDuration: number;
  reheatingInstructions: string;
  prepNotes?: string;
  recipe: Recipe;
}

interface EditBatchPlanModalProps {
  plan: BatchCookingPlan;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
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

export function EditBatchPlanModal({ plan, onClose, onSuccess }: EditBatchPlanModalProps) {
  const [activeTab, setActiveTab] = useState<'basic' | 'portions' | 'storage'>('basic');
  const toast = useToastStore();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<FormData>({
    name: plan.name,
    description: plan.description || '',
    cookingDate: plan.cookingDate.split('T')[0],
    batches: plan.batches,
    servingsPerBatch: plan.servingsPerBatch,
    storageMethod: plan.storageMethod,
    storageDuration: plan.storageDuration,
    reheatingInstructions: plan.reheatingInstructions,
    prepNotes: plan.prepNotes || '',
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Plan name is required';
    }
    if (!formData.cookingDate) {
      newErrors.cookingDate = 'Cooking date is required';
    }
    // Note: past cooking dates are allowed here — this modal only edits
    // existing plans, which may have been cooked already. The future-date
    // restriction applies to new plans (see CreateBatchPlanModal).
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
      await batchCookingApi.update(plan.id, formData);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Failed to update batch plan:', error);
      toast.error(error.response?.data?.message || 'Failed to update batch cooking plan. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog title="Edit Batch Cooking Plan" onClose={onClose} panelClassName="max-w-3xl">
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
              onClick={() => setActiveTab('portions')}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === 'portions'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Portions
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
              {/* Recipe (Read-only) */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Recipe (cannot be changed)
                </label>
                <div className="border border-border rounded-lg p-4 bg-accent/5">
                  <div className="flex items-center gap-3">
                    {plan.recipe.imageUrl ? (
                      <img
                        src={plan.recipe.imageUrl}
                        alt={plan.recipe.title}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                        <span className="text-2xl">🍽️</span>
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-foreground">{plan.recipe.title}</h3>
                      {plan.recipe.servings && (
                        <p className="text-sm text-muted-foreground">
                          Base recipe: {plan.recipe.servings} servings
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

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
                  className={`w-full rounded-lg border ${
                    errors.cookingDate ? 'border-destructive' : 'border-input'
                  } bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary`}
                />
                {errors.cookingDate && <p className="text-xs text-destructive mt-1">{errors.cookingDate}</p>}
              </div>
            </div>
          )}

          {/* Portions Tab */}
          {activeTab === 'portions' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-foreground mb-3">Adjust Portions</h3>
                <PortionCalculator
                  batches={formData.batches}
                  servingsPerBatch={formData.servingsPerBatch}
                  recipeServings={plan.recipe.servings}
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
        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
