import {
  AIService,
  AI_KEY_REQUIRED_MESSAGE,
  AI_KEY_REQUIRED_CODE,
  AI_OUT_OF_CREDITS_MESSAGE,
  AI_OUT_OF_CREDITS_CODE,
} from '../ai';
import { AppError } from '../../api/middleware/error-handler';
import type { IAIProvider } from '../ai/types';
import { MealPlanContextService, RecipeWithScore } from './meal-plan-context.service';
import type {
  MealPlanGenerateRequest,
  MealPlanPreview,
  MealSuggestion,
  RecipeSuggestion,
  ReplaceMealRequest,
} from '@nommable/shared';
import { v4 as uuidv4 } from 'uuid';

export class MealPlanGenerationService {
  /**
   * Generate intelligent meal plan preview
   */
  static async generatePreview(
    request: MealPlanGenerateRequest,
    userId?: string
  ): Promise<MealPlanPreview> {
    console.log('[MealPlanGeneration] Starting preview generation');

    // Preview is an AI feature: resolve for the actual caller and apply the
    // standard availability contract instead of silently substituting
    // placeholder suggestions when the caller cannot use AI.
    const resolution = await AIService.resolveProvider(userId);
    if (!resolution.ok) {
      const status =
        resolution.reason === 'no-user-key' ? 403 : resolution.reason === 'out-of-credits' ? 402 : 400;
      const message =
        resolution.reason === 'no-user-key'
          ? AI_KEY_REQUIRED_MESSAGE
          : resolution.reason === 'out-of-credits'
            ? AI_OUT_OF_CREDITS_MESSAGE
            : 'AI provider not configured';
      const code =
        resolution.reason === 'no-user-key'
          ? AI_KEY_REQUIRED_CODE
          : resolution.reason === 'out-of-credits'
            ? AI_OUT_OF_CREDITS_CODE
            : 'AI_NOT_CONFIGURED';
      const err = new AppError(status, message);
      (err as any).code = code;
      throw err;
    }
    const provider = resolution.provider;

    // Gather context about recipes, pantry, shopping list
    const context = await MealPlanContextService.gatherContext();

    console.log('[MealPlanGeneration] Context gathered:', {
      totalRecipes: context.totalRecipeCount,
      availableRecipes: context.availableRecipes.length,
      pantryIngredients: context.pantryIngredients.length,
      recentRecipeIds: context.recentRecipeIds.length
    });

    // Check if user has any recipes
    if (context.totalRecipeCount === 0) {
      throw new Error('No recipes available. Please add some recipes first.');
    }

    const preferExistingRecipes = request.preferExistingRecipes ?? true;
    const minDaysSinceLastUse = request.minDaysSinceLastUse ?? 14;
    const minIngredientMatchScore = request.minIngredientMatchScore ?? 0.3;

    // Build scored candidate pool without starving the generator when only 1-2 recipes
    // meet the freshness or pantry-match threshold.
    const freshSet = new Set(
      MealPlanContextService.filterFreshRecipes(
        context.availableRecipes,
        minDaysSinceLastUse
      ).map((r) => r.recipe.id)
    );
    const matchingSet = new Set(
      MealPlanContextService.filterByIngredientMatch(
        context.availableRecipes,
        minIngredientMatchScore
      ).map((r) => r.recipe.id)
    );

    const candidateRecipes: RecipeWithScore[] = context.availableRecipes
      .map((item) => ({
        ...item,
        freshnessPriority:
          item.freshnessPriority +
          (preferExistingRecipes && freshSet.has(item.recipe.id) ? 30 : 0) +
          (matchingSet.has(item.recipe.id) ? 25 : 0),
      }))
      .sort((a, b) => b.freshnessPriority - a.freshnessPriority);

    // Generate suggestions for each meal slot while tracking already-assigned recipes
    const mealSuggestions: MealSuggestion[] = [];
    const usedRecipeIds = new Set<string>();
    const usageCountByRecipeId = new Map<string, number>();

    console.log('[MealPlanGeneration] Generating suggestions for', request.mealSelections.length, 'meals');
    console.log('[MealPlanGeneration] Candidate recipes:', candidateRecipes.length);
    console.log('[MealPlanGeneration] Pantry-matching recipes:', matchingSet.size);

    for (const selection of request.mealSelections) {
      try {
        console.log('[MealPlanGeneration] Generating suggestion for:', selection.date, selection.mealType);

        const suggestion = await this.generateMealSuggestion(
          selection.date,
          selection.mealType,
          candidateRecipes,
          context.pantryIngredients,
          context.shoppingListIngredients,
          request,
          usedRecipeIds,
          usageCountByRecipeId,
          provider
        );

        mealSuggestions.push(suggestion);
        console.log('[MealPlanGeneration] Suggestion generated successfully');
      } catch (error: any) {
        console.error('[MealPlanGeneration] Error generating meal suggestion:', error.message);
        throw error;
      }
    }

    return {
      previewId: uuidv4(),
      mealSuggestions,
      context: {
        totalRecipesAvailable: context.totalRecipeCount,
        recentlyUsedCount: context.recentRecipeIds.length,
        pantryIngredientCount: context.pantryIngredients.length,
        shoppingListItemCount: context.shoppingListIngredients.length,
      },
    };
  }

  /**
   * Generate a single meal suggestion
   */
  private static async generateMealSuggestion(
    date: string,
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack',
    candidateRecipes: RecipeWithScore[],
    pantryIngredients: string[],
    shoppingListIngredients: string[],
    request: MealPlanGenerateRequest,
    usedRecipeIds: Set<string> = new Set(),
    usageCountByRecipeId: Map<string, number> = new Map(),
    provider?: IAIProvider
  ): Promise<MealSuggestion> {
    // Try to find a good existing recipe first (when preferExistingRecipes is enabled, default true)
    const preferExisting = request.preferExistingRecipes ?? true;
    const suitableRecipe = preferExisting
      ? this.findBestRecipeForMeal(
          candidateRecipes,
          mealType,
          request,
          usedRecipeIds,
          usageCountByRecipeId
        )
      : null;

    if (suitableRecipe) {
      const recipeId = suitableRecipe.recipe.id;
      usedRecipeIds.add(recipeId);
      usageCountByRecipeId.set(recipeId, (usageCountByRecipeId.get(recipeId) ?? 0) + 1);

      const suggestion: RecipeSuggestion = {
        type: 'existing',
        recipeId: suitableRecipe.recipe.id,
        recipe: {
          id: suitableRecipe.recipe.id,
          title: suitableRecipe.recipe.title,
          description: suitableRecipe.recipe.description || '',
          servings: suitableRecipe.recipe.servings,
          prepTime: suitableRecipe.recipe.prepTime,
          cookTime: suitableRecipe.recipe.cookTime,
          difficulty: suitableRecipe.recipe.difficulty as 'easy' | 'medium' | 'hard' | undefined,
          tags: suitableRecipe.recipe.tags,
          ingredients: suitableRecipe.recipe.ingredients?.map((ing) => ({
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
          })),
        },
        matchScore: suitableRecipe.ingredientMatchScore,
        daysSinceLastUsed: suitableRecipe.daysSinceLastUsed,
      };

      return {
        date,
        mealType,
        suggestion,
      };
    }

    // No suitable existing recipe, generate a new one with AI. The provider
    // was resolved by generatePreview for the actual caller; without one
    // (should not happen) keep the placeholder fallback.
    if (!provider) {
      return this.createPlaceholderSuggestion(date, mealType);
    }

    try {
      // Build AI prompt with context
      const prompt = this.buildAIPromptForMeal(
        mealType,
        pantryIngredients,
        shoppingListIngredients,
        request
      );

      const aiRecipe = await provider.generateRecipe(prompt, {
        dietary: request.dietary,
        cuisine: request.cuisine?.length ? request.cuisine[0] : undefined,
        servings: 4,
      });

      const suggestion: RecipeSuggestion = {
        type: 'new',
        recipe: {
          title: aiRecipe.title,
          description: aiRecipe.description,
          servings: aiRecipe.servings,
          prepTime: aiRecipe.prepTime,
          cookTime: aiRecipe.cookTime,
          difficulty: aiRecipe.difficulty,
          tags: aiRecipe.tags,
          ingredients: aiRecipe.ingredients,
        },
        matchScore: 0,
        daysSinceLastUsed: null,
      };

      return {
        date,
        mealType,
        suggestion,
      };
    } catch (error) {
      console.error('Error generating AI recipe for meal:', error);
      return this.createPlaceholderSuggestion(date, mealType);
    }
  }

  /**
   * Helper to extract normalized tags + categories from a recipe
   */
  private static getRecipeLabels(r: RecipeWithScore): string[] {
    const tags = Array.isArray(r.recipe.tags) ? r.recipe.tags : [];
    const categories = Array.isArray(r.recipe.categories) ? r.recipe.categories : [];
    return [...tags, ...categories].map((label) => label.toLowerCase().trim());
  }

  /**
   * Find the best existing recipe for a specific meal type without repeating already-selected recipes
   */
  private static findBestRecipeForMeal(
    recipes: RecipeWithScore[],
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack',
    request: MealPlanGenerateRequest,
    usedRecipeIds: Set<string>,
    usageCountByRecipeId: Map<string, number>
  ): RecipeWithScore | null {
    if (recipes.length === 0) {
      return null;
    }

    // 1. Exclude recipes containing any excluded ingredients
    let basePool = recipes;
    if (request.excludeIngredients?.length) {
      const excludedTerms = request.excludeIngredients
        .map((i) => i.toLowerCase().trim())
        .filter(Boolean);
      const withoutExcluded = basePool.filter((r) => {
        const ingNames = (r.recipe.ingredients || []).map((ing) => ing.name.toLowerCase());
        return !excludedTerms.some((term) =>
          ingNames.some((name) => name.includes(term))
        );
      });
      if (withoutExcluded.length > 0) {
        basePool = withoutExcluded;
      }
    }

    // 2. Filter by dietary requirements (checking both tags and categories)
    if (request.dietary?.length) {
      const dietaryFiltered = basePool.filter((r) => {
        const labels = this.getRecipeLabels(r);
        return request.dietary!.some((diet) =>
          labels.some((l) => l === diet.toLowerCase() || l.includes(diet.toLowerCase()))
        );
      });

      if (dietaryFiltered.length > 0) {
        basePool = dietaryFiltered;
      }
    }

    // 3. Filter by cuisine (checking both tags and categories)
    if (request.cuisine?.length) {
      const cuisineFiltered = basePool.filter((r) => {
        const labels = this.getRecipeLabels(r);
        return request.cuisine!.some((cuisine) =>
          labels.some((l) => l === cuisine.toLowerCase() || l.includes(cuisine.toLowerCase()))
        );
      });

      if (cuisineFiltered.length > 0) {
        basePool = cuisineFiltered;
      }
    }

    // 4. Match meal type using tags and categories (with common culinary aliases)
    const mealTypeAliases: Record<'breakfast' | 'lunch' | 'dinner' | 'snack', string[]> = {
      breakfast: ['breakfast', 'brunch', 'morning'],
      lunch: ['lunch', 'sandwich', 'salad', 'soup', 'wrap'],
      dinner: ['dinner', 'main', 'main course', 'main dish', 'main dishes', 'entree', 'supper'],
      snack: ['snack', 'snacks', 'appetizer', 'appetizers', 'side', 'side dish', 'side dishes'],
    };
    const targetAliases = mealTypeAliases[mealType] || [mealType.toLowerCase()];

    const mealTypeMatched = basePool.filter((r) => {
      const labels = this.getRecipeLabels(r);
      return targetAliases.some((alias) =>
        labels.some((l) => l === alias || l.includes(alias))
      );
    });

    // 5. Select from unused recipes first so the meal plan has real variety:
    //    Priority A: Unused recipes matching the meal type
    //    Priority B: Unused recipes from the broader basePool (when meal-type tags are sparse)
    //    Priority C: Unused recipes from all available recipes
    //    Priority D: Least-used recipes in this plan (only when total meals > total recipes)
    const unusedMealTypeMatched = mealTypeMatched.filter(
      (r) => !usedRecipeIds.has(r.recipe.id)
    );
    const unusedBasePool = basePool.filter((r) => !usedRecipeIds.has(r.recipe.id));
    const unusedAll = recipes.filter((r) => !usedRecipeIds.has(r.recipe.id));

    let candidatePool: RecipeWithScore[];
    if (unusedMealTypeMatched.length > 0) {
      candidatePool = unusedMealTypeMatched;
    } else if (unusedBasePool.length > 0) {
      candidatePool = unusedBasePool;
    } else if (unusedAll.length > 0) {
      candidatePool = unusedAll;
    } else {
      // Every recipe in the library has been used at least once in this plan;
      // pick from the recipes with the lowest repeat count so far.
      const poolToCycle = mealTypeMatched.length > 0 ? mealTypeMatched : basePool;
      const minCount = Math.min(
        ...poolToCycle.map((r) => usageCountByRecipeId.get(r.recipe.id) ?? 0)
      );
      candidatePool = poolToCycle.filter(
        (r) => (usageCountByRecipeId.get(r.recipe.id) ?? 0) === minCount
      );
    }

    if (candidatePool.length === 0) {
      return null;
    }

    // Pick among the top-scoring candidates (within 15 priority points of the best)
    // to provide variety across generated plans while respecting freshness & pantry match.
    const bestScore = candidatePool[0].freshnessPriority;
    const topTier = candidatePool.filter(
      (r) => bestScore - r.freshnessPriority <= 15
    );
    const chosenIndex = Math.floor(Math.random() * topTier.length);
    return topTier[chosenIndex];
  }

  /**
   * Build AI prompt with context
   */
  private static buildAIPromptForMeal(
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack',
    pantryIngredients: string[],
    shoppingListIngredients: string[],
    request: MealPlanGenerateRequest
  ): string {
    let prompt = `Generate a ${mealType} recipe`;

    if (request.dietary?.length) {
      prompt += ` that is ${request.dietary.join(' and ')}`;
    }

    if (request.cuisine?.length) {
      prompt += ` with ${request.cuisine[0]} cuisine`;
    }

    prompt += `. Available ingredients: ${pantryIngredients.slice(0, 20).join(', ')}`;

    if (shoppingListIngredients.length > 0) {
      prompt += `. Shopping list: ${shoppingListIngredients.slice(0, 10).join(', ')}`;
    }

    if (request.excludeIngredients?.length) {
      prompt += `. Do not use: ${request.excludeIngredients.join(', ')}`;
    }

    return prompt;
  }

  /**
   * Create a placeholder suggestion when AI is unavailable
   */
  private static createPlaceholderSuggestion(
    date: string,
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  ): MealSuggestion {
    return {
      date,
      mealType,
      suggestion: {
        type: 'new',
        recipe: {
          title: `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} Placeholder`,
          description: 'Add your own recipe here',
          servings: 4,
          prepTime: 0,
          cookTime: 0,
          difficulty: 'easy',
          tags: [],
          ingredients: [],
        },
        matchScore: 0,
        daysSinceLastUsed: null,
      },
    };
  }

  /**
   * Replace a specific meal in the preview with an alternative recipe or AI suggestion
   */
  static async replaceMeal(
    request: ReplaceMealRequest
  ): Promise<MealSuggestion> {
    const context = await MealPlanContextService.gatherContext();
    const excludedIds = new Set<string>(request.excludeRecipeIds || []);

    return this.generateMealSuggestion(
      request.date,
      request.mealType,
      context.availableRecipes,
      context.pantryIngredients,
      context.shoppingListIngredients,
      {
        mealSelections: [],
        dietary: request.dietary,
        cuisine: request.cuisine,
        excludeIngredients: request.excludeIngredients,
      },
      excludedIds
    );
  }
}
