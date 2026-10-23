import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware';
import { MealPlanService, MealPlanGenerationService, ShoppingListIntegrationService } from '../../services/meal-plan';
import { RecipeService } from '../../services/recipe';
import { AIService, sendAIUnavailable, providerError } from '../../services/ai';
import { CalendarExportService } from '../../services/calendar/calendar-export.service';
import type { MealPlanGenerateRequest, ReplaceMealRequest, MealPlanCommitRequest } from '@nommable/shared';

export class MealPlanController {
  private mealPlanService = new MealPlanService();
  private recipeService = new RecipeService();

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const mealPlan = await this.mealPlanService.create(req.userId!, req.body);
      res.status(201).json(mealPlan);
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { query, page, pageSize, sortBy, sortOrder } = req.query as Record<string, string>;
      const result = await this.mealPlanService.findAll(req.userId!, {
        query,
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
        sortBy,
        sortOrder: sortOrder as 'asc' | 'desc' | undefined,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async findById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const mealPlan = await this.mealPlanService.findById(req.params.id, req.userId!);
      res.json(mealPlan);
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const mealPlan = await this.mealPlanService.update(req.params.id, req.userId!, req.body);
      res.json(mealPlan);
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.mealPlanService.delete(req.params.id, req.userId!);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async bulkDelete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'No meal plan IDs provided' });
      }
      const deletedCount = await this.mealPlanService.bulkDelete(ids, req.userId!);
      res.json({ deletedCount, message: `${deletedCount} meal plan(s) deleted successfully` });
    } catch (error) {
      next(error);
    }
  }

  async addMeal(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const mealPlan = await this.mealPlanService.addMeal(req.params.id, req.userId!, req.body);
      res.json(mealPlan);
    } catch (error) {
      next(error);
    }
  }

  async removeMeal(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const mealPlan = await this.mealPlanService.removeMeal(
        req.params.id,
        req.userId!,
        req.params.mealId
      );
      res.json(mealPlan);
    } catch (error) {
      next(error);
    }
  }

  async generateWithAI(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resolution = await AIService.resolveProvider(req.userId);

      if (!resolution.ok) {
        return sendAIUnavailable(res, resolution);
      }

      const provider = resolution.provider;

      const { days, servings, dietary, cuisine, excludeIngredients, budget } = req.body;

      // Get AI meal plan suggestion
      const suggestion = await provider
        .generateMealPlan({
          days,
          servings,
          dietary,
          cuisine,
          excludeIngredients,
          budget,
        })
        .catch((err) => {
          throw providerError(err);
        });

      // Create placeholder recipes for each meal suggestion
      const mealRecipes: Array<{
        recipeId: string;
        date: Date;
        mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
        servings: number;
      }> = [];

      for (const day of suggestion.days) {
        const date = new Date(day.date);

        for (const meal of day.meals) {
          // Create minimal recipe from suggestion
          const recipe = await this.recipeService.create(
            req.userId!,
            {
              title: meal.recipeSuggestion.title,
              description: meal.recipeSuggestion.description,
              servings: servings,
              prepTime: 0,
              cookTime: meal.recipeSuggestion.estimatedTime,
              difficulty: 'medium',
              ingredients: [], // Placeholder - user can add later
              instructions: [
                'This is an AI-generated meal suggestion.',
                'Add your own ingredients and detailed instructions to complete this recipe.',
              ],
              tags: ['ai-generated', 'meal-plan'],
            },
            true // isAiGenerated flag
          );

          mealRecipes.push({
            recipeId: recipe.id,
            date: date,
            mealType: meal.mealType,
            servings: servings,
          });
        }
      }

      // Calculate start and end dates
      const dates = suggestion.days.map((d) => new Date(d.date));
      const startDate = new Date(Math.min(...dates.map((d) => d.getTime())));
      const endDate = new Date(Math.max(...dates.map((d) => d.getTime())));

      // Create meal plan with recipes
      const mealPlan = await this.mealPlanService.create(
        req.userId!,
        {
          name: `AI Generated Meal Plan - ${days} days`,
          description: [
            dietary?.length ? `Dietary: ${dietary.join(', ')}` : '',
            cuisine?.length ? `Cuisine: ${cuisine.join(', ')}` : '',
            excludeIngredients?.length ? `Excludes: ${excludeIngredients.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join(' | ') || 'AI-generated meal plan',
          startDate,
          endDate,
          meals: mealRecipes,
        },
        true // isAiGenerated flag
      );

      await AIService.consumeManagedCredit(req.userId);
      res.json(mealPlan);
    } catch (error) {
      console.error('Error generating meal plan with AI:', error);
      next(error);
    }
  }

  async exportToCalendar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const icsContent = await CalendarExportService.exportMealPlanToICS(
        req.params.id,
        req.userId!
      );

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="meal-plan.ics"');
      res.send(icsContent);
    } catch (error) {
      next(error);
    }
  }

  async generatePreview(req: AuthRequest, res: Response, _next: NextFunction) {
    try {
      const request: MealPlanGenerateRequest = req.body;

      // Validate request
      if (!request.mealSelections || request.mealSelections.length === 0) {
        return res.status(400).json({ error: 'No meals selected' });
      }

      console.log('[MealPlan] Generating preview for user:', req.userId);
      console.log('[MealPlan] Meal selections:', request.mealSelections.length);

      const preview = await MealPlanGenerationService.generatePreview(request, req.userId);

      console.log('[MealPlan] Preview generated successfully:', preview.previewId);
      res.json(preview);
    } catch (error: any) {
      console.error('Error generating meal plan preview:', error);
      console.error('Error stack:', error.stack);

      // Standard AI availability errors carry their own status + code.
      if (error.statusCode) {
        return res
          .status(error.statusCode)
          .json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      }

      // Send more helpful error messages
      if (error.message?.includes('No recipes')) {
        return res.status(400).json({
          error: 'You need to add some recipes before generating a meal plan'
        });
      }

      res.status(500).json({
        error: 'Failed to generate meal plan. Please try again.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async replaceMeal(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const request: ReplaceMealRequest = req.body;
      const suggestion = await MealPlanGenerationService.replaceMeal(request);
      res.json(suggestion);
    } catch (error) {
      console.error('Error replacing meal:', error);
      next(error);
    }
  }

  async commitPreview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const request: MealPlanCommitRequest = req.body;
      const { name, description, overrides } = request;

      // Get the preview from request body (client-side storage)
      const { mealSuggestions } = req.body;

      if (!mealSuggestions || !Array.isArray(mealSuggestions)) {
        return res.status(400).json({ error: 'Invalid preview data' });
      }

      // Create recipes for each meal
      const mealRecipes: Array<{
        recipeId: string;
        date: Date;
        mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
        servings: number;
      }> = [];

      for (const mealSuggestion of mealSuggestions) {
        // Check if this meal was overridden
        const override = overrides?.find(
          (o) => o.date === mealSuggestion.date && o.mealType === mealSuggestion.mealType
        );

        let recipeId: string;

        if (override) {
          // Use override recipe
          recipeId = override.recipeId;
        } else if (mealSuggestion.suggestion.type === 'existing') {
          // Use existing recipe
          recipeId = mealSuggestion.suggestion.recipeId!;
        } else {
          // Create new recipe from AI suggestion
          const recipe = await this.recipeService.create(
            req.userId!,
            {
              title: mealSuggestion.suggestion.recipe.title,
              description: mealSuggestion.suggestion.recipe.description,
              servings: mealSuggestion.suggestion.recipe.servings || 4,
              prepTime: mealSuggestion.suggestion.recipe.prepTime || 0,
              cookTime: mealSuggestion.suggestion.recipe.cookTime || 0,
              difficulty: mealSuggestion.suggestion.recipe.difficulty || 'medium',
              ingredients: mealSuggestion.suggestion.recipe.ingredients?.map((ing: any, idx: number) => ({
                ...ing,
                order: idx,
              })) || [],
              instructions: [
                'This is an AI-generated recipe placeholder.',
                'Edit this recipe to add detailed instructions.',
              ],
              tags: mealSuggestion.suggestion.recipe.tags || ['ai-generated', 'meal-plan'],
            },
            true // isAiGenerated
          );

          recipeId = recipe.id;
        }

        mealRecipes.push({
          recipeId,
          date: new Date(mealSuggestion.date),
          mealType: mealSuggestion.mealType,
          servings: mealSuggestion.suggestion.recipe.servings || 4,
        });
      }

      // Calculate start and end dates
      const dates = mealRecipes.map((m) => m.date);
      const startDate = new Date(Math.min(...dates.map((d) => d.getTime())));
      const endDate = new Date(Math.max(...dates.map((d) => d.getTime())));

      // Create meal plan
      const mealPlan = await this.mealPlanService.create(
        req.userId!,
        {
          name: name || `Meal Plan - ${startDate.toLocaleDateString()}`,
          description,
          startDate,
          endDate,
          meals: mealRecipes,
        },
        true // isAiGenerated
      );

      res.status(201).json(mealPlan);
    } catch (error) {
      console.error('Error committing meal plan:', error);
      next(error);
    }
  }

  async getMissingIngredients(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const mealPlan = await this.mealPlanService.findById(req.params.id, req.userId!);

      // Extract recipe IDs from meal plan
      const recipeIds = [...new Set(mealPlan.meals?.map((m) => m.recipeId) || [])];

      const missingIngredients = await ShoppingListIntegrationService.calculateMissingIngredients(
        recipeIds
      );

      res.json({ missingIngredients, count: missingIngredients.length });
    } catch (error) {
      console.error('Error calculating missing ingredients:', error);
      next(error);
    }
  }

  async addToShoppingList(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const mealPlan = await this.mealPlanService.findById(req.params.id, req.userId!);

      // Extract recipe IDs from meal plan
      const recipeIds = [...new Set(mealPlan.meals?.map((m) => m.recipeId) || [])];

      const { shoppingListId } = req.body;

      const result = await ShoppingListIntegrationService.addMissingIngredientsToShoppingList(
        req.userId!,
        recipeIds,
        shoppingListId
      );

      res.json({
        shoppingList: result.shoppingList,
        addedCount: result.addedCount,
        message: `Added ${result.addedCount} ingredients to shopping list`,
      });
    } catch (error) {
      console.error('Error adding to shopping list:', error);
      next(error);
    }
  }
}
