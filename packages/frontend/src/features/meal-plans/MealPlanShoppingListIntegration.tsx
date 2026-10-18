import { useState } from 'react';
import { mealPlanApi } from '@/services/api';
import { useNavigate } from 'react-router-dom';
import { useToastStore } from '@/store/toast.store';

interface MissingIngredient {
  name: string;
  quantity?: number;
  unit?: string;
  recipeTitle: string;
  recipeId: string;
}

interface MealPlanShoppingListIntegrationProps {
  mealPlanId: string;
}

export function MealPlanShoppingListIntegration({
  mealPlanId,
}: MealPlanShoppingListIntegrationProps) {
  const toast = useToastStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [missingIngredients, setMissingIngredients] = useState<MissingIngredient[]>([]);
  const [showIngredients, setShowIngredients] = useState(false);
  const [adding, setAdding] = useState(false);

  const loadMissingIngredients = async () => {
    setLoading(true);
    try {
      const response = await mealPlanApi.getMissingIngredients(mealPlanId);
      setMissingIngredients(response.data.missingIngredients);
      setShowIngredients(true);
    } catch (error) {
      console.error('Failed to load missing ingredients:', error);
      toast.error('Failed to check ingredients. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToShoppingList = async () => {
    setAdding(true);
    try {
      const response = await mealPlanApi.addToShoppingList(mealPlanId);
      toast.success(response.data.message);
      setShowIngredients(false);
      // Optionally navigate to shopping list
      if (response.data.shoppingList?.id) {
        navigate(`/shopping-lists/${response.data.shoppingList.id}`);
      }
    } catch (error) {
      console.error('Failed to add to shopping list:', error);
      toast.error('Failed to add ingredients. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  // Group ingredients by recipe
  const ingredientsByRecipe = missingIngredients.reduce((acc, ingredient) => {
    if (!acc[ingredient.recipeTitle]) {
      acc[ingredient.recipeTitle] = [];
    }
    acc[ingredient.recipeTitle].push(ingredient);
    return acc;
  }, {} as Record<string, MissingIngredient[]>);

  return (
    <div className="border-t border-border pt-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-foreground">Shopping List</h3>
        <button
          onClick={loadMissingIngredients}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Checking...
            </>
          ) : (
            <>
              🛒 Check Missing Ingredients
            </>
          )}
        </button>
      </div>

      {showIngredients && (
        <div className="bg-accent/10 rounded-lg p-4 space-y-4">
          {missingIngredients.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-green-700 dark:text-green-400 font-medium">
                ✓ You have all ingredients in your pantry!
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Found {missingIngredients.length} ingredients you need to buy:
                  </p>
                  <div className="space-y-3">
                    {Object.entries(ingredientsByRecipe).map(([recipeTitle, ingredients]) => (
                      <div key={recipeTitle} className="text-sm">
                        <p className="font-medium text-foreground mb-1">
                          {recipeTitle}:
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                          {ingredients.map((ing, idx) => (
                            <li key={idx}>
                              {ing.quantity && ing.unit
                                ? `${ing.quantity} ${ing.unit} `
                                : ''}
                              {ing.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-border">
                <button
                  onClick={handleAddToShoppingList}
                  disabled={adding}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  {adding ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Adding...
                    </>
                  ) : (
                    <>
                      + Add to Shopping List
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowIngredients(false)}
                  className="px-4 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
