import { useState } from 'react';
import { AutoAwesomeIcon } from '@/components/icons/MaterialIcon';
import { Dialog } from '@/components/Dialog';
import type { MealSelection } from '@nommable/shared';
import { useToastStore } from '@/store/toast.store';

interface IntelligentMealPlanModalProps {
  onClose: () => void;
  onGenerate: (request: any) => void;
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

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { value: 'lunch', label: 'Lunch', icon: '☀️' },
  { value: 'dinner', label: 'Dinner', icon: '🌙' },
  { value: 'snack', label: 'Snack', icon: '🍎' },
];

export function IntelligentMealPlanModal({ onClose, onGenerate }: IntelligentMealPlanModalProps) {
  const toast = useToastStore();
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [mealTypesByDate, setMealTypesByDate] = useState<Record<string, string[]>>({});
  const [dietary, setDietary] = useState<string[]>([]);
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [excludedIngredients, setExcludedIngredients] = useState('');
  const [preferExisting, setPreferExisting] = useState(true);
  const [minDaysSinceLastUse, setMinDaysSinceLastUse] = useState(14);

  // Generate next 14 days for selection
  const availableDates = Array.from({ length: 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    return date.toISOString().split('T')[0];
  });

  const toggleDate = (date: string) => {
    setSelectedDates((prev) => {
      if (prev.includes(date)) {
        // Remove date and its meal types
        const newDates = prev.filter((d) => d !== date);
        const newMealTypes = { ...mealTypesByDate };
        delete newMealTypes[date];
        setMealTypesByDate(newMealTypes);
        return newDates;
      } else {
        // Add date with dinner as default
        const newMealTypes = { ...mealTypesByDate, [date]: ['dinner'] };
        setMealTypesByDate(newMealTypes);
        return [...prev, date];
      }
    });
  };

  const toggleMealType = (date: string, mealType: string) => {
    setMealTypesByDate((prev) => {
      const currentMealTypes = prev[date] || [];
      if (currentMealTypes.includes(mealType)) {
        const newMealTypes = currentMealTypes.filter((m) => m !== mealType);
        return { ...prev, [date]: newMealTypes };
      } else {
        return { ...prev, [date]: [...currentMealTypes, mealType] };
      }
    });
  };

  const toggleDietary = (option: string) => {
    setDietary((prev) =>
      prev.includes(option) ? prev.filter((d) => d !== option) : [...prev, option]
    );
  };

  const toggleCuisine = (option: string) => {
    setCuisines((prev) =>
      prev.includes(option) ? prev.filter((c) => c !== option) : [...prev, option]
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const handleGenerate = () => {
    // Build meal selections
    const mealSelections: MealSelection[] = [];
    selectedDates.forEach((date) => {
      const mealTypes = mealTypesByDate[date] || [];
      mealTypes.forEach((mealType) => {
        mealSelections.push({
          date,
          mealType: mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack',
        });
      });
    });

    if (mealSelections.length === 0) {
      toast.error('Please select at least one day and meal type.');
      return;
    }

    const request = {
      mealSelections,
      dietary: dietary.length > 0 ? dietary : undefined,
      cuisine: cuisines.length > 0 ? cuisines : undefined,
      excludeIngredients: excludedIngredients.trim()
        ? excludedIngredients.split(',').map((i) => i.trim()).filter(Boolean)
        : undefined,
      preferExistingRecipes: preferExisting,
      minDaysSinceLastUse,
      minIngredientMatchScore: 0.3,
    };

    onGenerate(request);
  };

  const totalMeals = selectedDates.reduce(
    (sum, date) => sum + (mealTypesByDate[date]?.length || 0),
    0
  );

  return (
    <Dialog title="Intelligent Meal Plan Generator" onClose={onClose} panelClassName="max-w-4xl">
      <div className="p-6">
        <p className="text-sm text-muted-foreground mb-4">
          Select days and meals - we'll use recipes you have and ingredients on hand
        </p>

        {/* Content */}
        <div className="space-y-6">
          {/* Day Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">
              Select Days <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-7 gap-2">
              {availableDates.map((date) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => toggleDate(date)}
                  className={`p-2 rounded-lg text-xs font-medium transition-all border ${
                    selectedDates.includes(date)
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  {formatDate(date)}
                </button>
              ))}
            </div>
          </div>

          {/* Meal Type Selection per Day */}
          {selectedDates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                Select Meal Types for Each Day <span className="text-destructive">*</span>
              </label>
              <div className="space-y-3">
                {selectedDates.map((date) => (
                  <div key={date} className="bg-accent/10 rounded-lg p-4">
                    <div className="text-sm font-medium text-foreground mb-2">
                      {formatDate(date)}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {MEAL_TYPES.map((mealType) => (
                        <button
                          key={mealType.value}
                          type="button"
                          onClick={() => toggleMealType(date, mealType.value)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1 ${
                            mealTypesByDate[date]?.includes(mealType.value)
                              ? 'bg-secondary text-secondary-foreground shadow-sm'
                              : 'bg-background border border-border text-muted-foreground hover:border-secondary/50 hover:text-foreground'
                          }`}
                        >
                          <span>{mealType.icon}</span>
                          {mealType.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Total meals: {totalMeals}
              </div>
            </div>
          )}

          {/* Preferences */}
          <div className="border-t border-border pt-6">
            <h3 className="text-sm font-medium text-foreground mb-3">Preferences (Optional)</h3>

            {/* Dietary Requirements */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                Dietary requirements
              </label>
              <div className="flex flex-wrap gap-2">
                {DIETARY_OPTIONS.map((option) => (
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
            <div className="mb-4">
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                Cuisine preferences
              </label>
              <div className="flex flex-wrap gap-2">
                {CUISINE_OPTIONS.map((option) => (
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
            <div className="mb-4">
              <label htmlFor="excluded" className="block text-xs font-medium text-muted-foreground mb-2">
                Exclude ingredients
              </label>
              <input
                id="excluded"
                type="text"
                value={excludedIngredients}
                onChange={(e) => setExcludedIngredients(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="E.g., peanuts, shellfish, mushrooms"
              />
              <p className="text-xs text-muted-foreground mt-1">Comma-separated list</p>
            </div>

            {/* Advanced Options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Prefer existing recipes
                </label>
                <input
                  type="checkbox"
                  checked={preferExisting}
                  onChange={(e) => setPreferExisting(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">
                  Avoid recipes used in last {minDaysSinceLastUse} days
                </label>
                <input
                  type="range"
                  min="7"
                  max="60"
                  step="7"
                  value={minDaysSinceLastUse}
                  onChange={(e) => setMinDaysSinceLastUse(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={totalMeals === 0}
            className="px-6 py-2 rounded-lg border border-border bg-background font-medium text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            <AutoAwesomeIcon size={18} />
            Generate Plan ({totalMeals} meals)
          </button>
        </div>
      </div>
    </Dialog>
  );
}
