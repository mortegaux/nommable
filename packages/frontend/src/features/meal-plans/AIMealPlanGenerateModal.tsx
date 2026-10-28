import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { mealPlanApi } from '@/services/api';
import { AutoAwesomeIcon } from '@/components/icons/MaterialIcon';
import { Dialog } from '@/components/Dialog';
import { Callout } from '@/components/Callout';
import type { AIMealPlanRequest } from '@nommable/shared';

interface AIMealPlanGenerateModalProps {
  onClose: () => void;
}

const DIETARY_OPTIONS = [
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Dairy-Free',
  'Low-Carb',
  'Keto',
  'Paleo',
];

const CUISINE_OPTIONS = [
  'Italian',
  'Chinese',
  'Mexican',
  'Indian',
  'Japanese',
  'Thai',
  'French',
  'Mediterranean',
  'American',
  'Korean',
];

const BUDGET_OPTIONS = [
  { value: 'low', label: 'Budget-Friendly' },
  { value: 'medium', label: 'Moderate' },
  { value: 'high', label: 'Premium' },
];

export function AIMealPlanGenerateModal({ onClose }: AIMealPlanGenerateModalProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [days, setDays] = useState(7);
  const [servings, setServings] = useState(4);
  const [dietary, setDietary] = useState<string[]>([]);
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [excludedIngredients, setExcludedIngredients] = useState('');
  const [budget, setBudget] = useState<'low' | 'medium' | 'high'>('medium');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (days < 1 || days > 14) {
      setError('Please select between 1 and 14 days');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const requestData: AIMealPlanRequest = {
        days,
        servings,
        ...(dietary.length > 0 && { dietary }),
        ...(cuisines.length > 0 && { cuisine: cuisines }),
        ...(excludedIngredients.trim() && {
          excludeIngredients: excludedIngredients.split(',').map(i => i.trim()).filter(Boolean)
        }),
        budget,
      };

      const response = await mealPlanApi.generateWithAI(requestData);
      const mealPlanId = response.data.id;

      // A successful generation may have consumed a credit — refresh the
      // badge before navigating so it shows the true balance.
      await useAuthStore.getState().refreshUser();

      // Close modal and navigate to the new meal plan
      onClose();
      navigate(`/meal-plans/${mealPlanId}`);
    } catch (err: any) {
      console.error('Failed to generate meal plan:', err);
      setError(err.response?.data?.error || 'Failed to generate meal plan. Please check your AI configuration.');
    } finally {
      setLoading(false);
    }
  };

  const toggleDietary = (option: string) => {
    setDietary(prev =>
      prev.includes(option)
        ? prev.filter(d => d !== option)
        : [...prev, option]
    );
  };

  const toggleCuisine = (option: string) => {
    setCuisines(prev =>
      prev.includes(option)
        ? prev.filter(c => c !== option)
        : [...prev, option]
    );
  };

  return (
    <Dialog title="Generate Meal Plan with AI" onClose={onClose} panelClassName="max-w-2xl">
      <div className="p-6">
        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Callout tone="error" role="alert">
              {error}
            </Callout>
          )}

          {/* Days and Servings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="days" className="block text-sm font-medium text-foreground mb-2">
                Number of days <span className="text-destructive">*</span>
              </label>
              <input
                id="days"
                type="number"
                min="1"
                max="14"
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value) || 7)}
                className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">1-14 days</p>
            </div>

            <div>
              <label htmlFor="servings" className="block text-sm font-medium text-foreground mb-2">
                Servings per meal <span className="text-destructive">*</span>
              </label>
              <input
                id="servings"
                type="number"
                min="1"
                max="20"
                value={servings}
                onChange={(e) => setServings(parseInt(e.target.value) || 4)}
                className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          {/* Dietary Requirements */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Dietary requirements (optional)
            </label>
            <div className="flex flex-wrap gap-2">
              {DIETARY_OPTIONS.map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleDietary(option)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    dietary.includes(option)
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-background border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* Cuisine Preferences */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Cuisine preferences (optional)
            </label>
            <div className="flex flex-wrap gap-2">
              {CUISINE_OPTIONS.map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleCuisine(option)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    cuisines.includes(option)
                      ? 'bg-secondary text-secondary-foreground shadow-sm'
                      : 'bg-background border border-border text-muted-foreground hover:border-secondary/50 hover:text-foreground'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* Excluded Ingredients */}
          <div>
            <label htmlFor="excluded" className="block text-sm font-medium text-foreground mb-2">
              Exclude ingredients (optional)
            </label>
            <input
              id="excluded"
              type="text"
              value={excludedIngredients}
              onChange={(e) => setExcludedIngredients(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="E.g., peanuts, shellfish, mushrooms"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Comma-separated list of ingredients to avoid
            </p>
          </div>

          {/* Budget Level */}
          <div>
            <label htmlFor="budget" className="block text-sm font-medium text-foreground mb-2">
              Budget level
            </label>
            <select
              id="budget"
              value={budget}
              onChange={(e) => setBudget(e.target.value as 'low' | 'medium' | 'high')}
              className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {BUDGET_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </form>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 rounded-lg border border-border bg-background font-medium text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              <>
                <AutoAwesomeIcon size={18} />
                Generate Meal Plan
              </>
            )}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
