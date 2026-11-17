import { useState, useEffect, useRef } from 'react';
import { preferencesApi } from '@/services/api';
import { AlertTriangle, Heart, X } from 'lucide-react';
import { Callout } from '@/components/Callout';

interface UserPreferences {
  id?: string;
  dietaryRestrictions?: string[];
  allergies?: string[];
  dislikes?: string[];
  favorites?: string[];
  preferredCuisines?: string[];
  skillLevel?: 'beginner' | 'intermediate' | 'advanced';
  maxCookingTime?: number;
  householdSize?: number;
  spiceTolerance?: 'none' | 'mild' | 'medium' | 'hot' | 'very-hot';
  budgetLevel?: 'budget' | 'moderate' | 'splurge';
}

const DIETARY_RESTRICTIONS = [
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Dairy-Free',
  'Low-Carb',
  'Keto',
  'Paleo',
  'Pescatarian',
  'Halal',
  'Kosher',
];

const COMMON_ALLERGENS = [
  'Peanuts',
  'Tree Nuts',
  'Shellfish',
  'Fish',
  'Eggs',
  'Milk',
  'Soy',
  'Wheat',
  'Sesame',
];

const CUISINES = [
  'Italian',
  'Mexican',
  'Chinese',
  'Japanese',
  'Indian',
  'Thai',
  'French',
  'Greek',
  'American',
  'Mediterranean',
  'Korean',
  'Vietnamese',
];

export default function PreferencesPage() {
  const [preferences, setPreferences] = useState<UserPreferences>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const messageTimeoutRef = useRef<NodeJS.Timeout>();

  // Form inputs
  const [customDislikes, setCustomDislikes] = useState('');
  const [customFavorites, setCustomFavorites] = useState('');

  useEffect(() => {
    loadPreferences();
  }, []);

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    };
  }, []);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const response = await preferencesApi.getPreferences();
      setPreferences(response.data);
    } catch (error) {
      console.error('Failed to load preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage('');
      await preferencesApi.updatePreferences(preferences);
      setMessage('Preferences saved.');
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
      messageTimeoutRef.current = setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save preferences:', error);
      setMessage('Failed to save preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleArrayItem = (key: keyof UserPreferences, value: string) => {
    setPreferences((prev) => {
      const array = (prev[key] as string[]) || [];
      const exists = array.includes(value);

      return {
        ...prev,
        [key]: exists
          ? array.filter((item) => item !== value)
          : [...array, value],
      };
    });
  };

  const addCustomItem = (key: keyof UserPreferences, value: string) => {
    if (!value.trim()) return;

    setPreferences((prev) => {
      const array = (prev[key] as string[]) || [];
      return {
        ...prev,
        [key]: [...array, value.trim()],
      };
    });
  };

  const removeCustomItem = (key: keyof UserPreferences, value: string) => {
    setPreferences((prev) => {
      const array = (prev[key] as string[]) || [];
      return {
        ...prev,
        [key]: array.filter((item) => item !== value),
      };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading preferences</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-medium leading-tight text-balance text-foreground">Family preferences</h1>
        <p className="text-muted-foreground mt-1">
          Customize your cooking experience based on your family's needs and preferences
        </p>
      </div>

      {message && (
        <Callout
          tone={message.includes('saved') ? 'success' : 'error'}
          role={message.includes('saved') ? undefined : 'alert'}
          className="mb-6"
        >
          {message}
        </Callout>
      )}

      <div className="space-y-8">
        {/* Dietary Restrictions */}
        <section className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-xl font-medium text-foreground mb-2">Dietary restrictions</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Select any dietary restrictions your family follows
          </p>
          <div className="flex flex-wrap gap-2">
            {DIETARY_RESTRICTIONS.map((restriction) => {
              const isSelected = preferences.dietaryRestrictions?.includes(restriction);
              return (
                <button
                  key={restriction}
                  onClick={() => toggleArrayItem('dietaryRestrictions', restriction)}
                  className={`px-4 py-2 rounded-full font-medium transition-colors ${
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-background border border-border text-foreground hover:bg-accent'
                  }`}
                >
                  {restriction}
                </button>
              );
            })}
          </div>
        </section>

        {/* Allergies */}
        <section className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-6 w-6 text-destructive" strokeWidth={1.5} aria-hidden="true" />
            <h2 className="text-xl font-medium text-foreground">Food allergies</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Select any allergens to receive warnings when they appear in recipes
          </p>
          <div className="flex flex-wrap gap-2">
            {COMMON_ALLERGENS.map((allergen) => {
              const isSelected = preferences.allergies?.includes(allergen);
              return (
                <button
                  key={allergen}
                  onClick={() => toggleArrayItem('allergies', allergen)}
                  className={`px-4 py-2 rounded-full font-medium transition-colors ${
                    isSelected
                      ? 'bg-destructive text-destructive-foreground shadow-sm'
                      : 'bg-background border border-border text-foreground hover:bg-destructive/10'
                  }`}
                >
                  {allergen}
                </button>
              );
            })}
          </div>
        </section>

        {/* Dislikes */}
        <section className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-xl font-medium text-foreground mb-2">Disliked ingredients</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Add ingredients your family doesn't enjoy
          </p>

          <div className="flex gap-2 mb-4">
            <label htmlFor="pref-dislikes-input" className="sr-only">
              Add a disliked ingredient
            </label>
            <input
              id="pref-dislikes-input"
              type="text"
              value={customDislikes}
              onChange={(e) => setCustomDislikes(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  addCustomItem('dislikes', customDislikes);
                  setCustomDislikes('');
                }
              }}
              placeholder="E.g., mushrooms, cilantro, olives"
              className="flex-1 rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={() => {
                addCustomItem('dislikes', customDislikes);
                setCustomDislikes('');
              }}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              Add
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {preferences.dislikes?.map((item) => (
              <div
                key={item}
                className="px-4 py-2 rounded-full bg-accent border border-border flex items-center gap-2"
              >
                <span className="text-foreground">{item}</span>
                <button
                  onClick={() => removeCustomItem('dislikes', item)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Remove ${item}`}
                >
                  <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Favorites */}
        <section className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
            <h2 className="text-xl font-medium text-foreground">Favorite ingredients</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Add ingredients your family loves
          </p>

          <div className="flex gap-2 mb-4">
            <label htmlFor="pref-favorites-input" className="sr-only">
              Add a favorite ingredient
            </label>
            <input
              id="pref-favorites-input"
              type="text"
              value={customFavorites}
              onChange={(e) => setCustomFavorites(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  addCustomItem('favorites', customFavorites);
                  setCustomFavorites('');
                }
              }}
              placeholder="E.g., chicken, pasta, chocolate"
              className="flex-1 rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={() => {
                addCustomItem('favorites', customFavorites);
                setCustomFavorites('');
              }}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              Add
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {preferences.favorites?.map((item) => (
              <div
                key={item}
                className="px-4 py-2 rounded-full bg-secondary/10 border border-secondary/20 flex items-center gap-2"
              >
                <span className="text-foreground">{item}</span>
                <button
                  onClick={() => removeCustomItem('favorites', item)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Remove ${item}`}
                >
                  <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Preferred Cuisines */}
        <section className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-xl font-medium text-foreground mb-2">Preferred cuisines</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Select your favorite types of cuisine
          </p>
          <div className="flex flex-wrap gap-2">
            {CUISINES.map((cuisine) => {
              const isSelected = preferences.preferredCuisines?.includes(cuisine);
              return (
                <button
                  key={cuisine}
                  onClick={() => toggleArrayItem('preferredCuisines', cuisine)}
                  className={`px-4 py-2 rounded-full font-medium transition-colors ${
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-background border border-border text-foreground hover:bg-accent'
                  }`}
                >
                  {cuisine}
                </button>
              );
            })}
          </div>
        </section>

        {/* Cooking Profile */}
        <section className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-xl font-medium text-foreground mb-4">Cooking profile</h2>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Skill Level */}
            <div>
              <label htmlFor="pref-skill-level" className="block text-sm font-medium text-foreground mb-2">
                Cooking skill level
              </label>
              <select
                id="pref-skill-level"
                value={preferences.skillLevel || ''}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    skillLevel: e.target.value as any,
                  })
                }
                className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>

            {/* Max Cooking Time */}
            <div>
              <label htmlFor="pref-max-time" className="block text-sm font-medium text-foreground mb-2">
                Maximum cooking time (minutes)
              </label>
              <input
                id="pref-max-time"
                type="number"
                value={preferences.maxCookingTime || ''}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    maxCookingTime: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                placeholder="e.g., 60"
                className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Household size */}
            <div>
              <label htmlFor="pref-household-size" className="block text-sm font-medium text-foreground mb-2">
                Household size
              </label>
              <input
                id="pref-household-size"
                type="number"
                value={preferences.householdSize || ''}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    householdSize: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                placeholder="e.g., 4"
                className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Spice tolerance */}
            <div>
              <label htmlFor="pref-spice-tolerance" className="block text-sm font-medium text-foreground mb-2">
                Spice tolerance
              </label>
              <select
                id="pref-spice-tolerance"
                value={preferences.spiceTolerance || ''}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    spiceTolerance: e.target.value as any,
                  })
                }
                className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select</option>
                <option value="none">No spice</option>
                <option value="mild">Mild</option>
                <option value="medium">Medium</option>
                <option value="hot">Hot</option>
                <option value="very-hot">Very hot</option>
              </select>
            </div>

            {/* Budget Level */}
            <div className="md:col-span-2">
              <label htmlFor="pref-budget-level" className="block text-sm font-medium text-foreground mb-2">
                Budget consciousness
              </label>
              <select
                id="pref-budget-level"
                value={preferences.budgetLevel || ''}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    budgetLevel: e.target.value as any,
                  })
                }
                className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select</option>
                <option value="budget">Budget-friendly</option>
                <option value="moderate">Moderate</option>
                <option value="splurge">Splurge</option>
              </select>
            </div>
          </div>
        </section>

        {/* Save Button */}
        <div className="flex justify-end gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving' : 'Save preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}
