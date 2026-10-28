import { Response, NextFunction } from 'express';
import { AuthRequest, AppError } from '../middleware';
import { RecipeService } from '../../services/recipe';
import { ScraperService } from '../../services/scraper';
import {
  AIService,
  sendAIUnavailable,
  AI_KEY_REQUIRED_CODE,
  AI_OUT_OF_CREDITS_CODE,
  AI_OUT_OF_CREDITS_MESSAGE,
  providerError,
} from '../../services/ai';
import { RecipeCategorizerService } from '../../services/recipe/recipe-categorizer.service';
import { RatingService } from '../../services/rating/rating.service';
import { processImage } from '../../utils/image-processor';
import { parseFraction } from '../../utils/fraction-parser';
import { ImageInput } from '../../services/ai/types';
import { RecipeView } from '../../db/entities/RecipeView';
import { AppDataSource } from '../../db/data-source';
import { SuggestionService } from '../../services/suggestion/suggestion.service';
import { CollectionService } from '../../services/collection/collection.service';
import { ImageStorageService } from '../../services/image-storage.service';
import { SystemSettingsService } from '../../services/settings/system-settings.service';

export class RecipeController {
  private recipeService = new RecipeService();
  private scraperService = new ScraperService();
  private ratingService = new RatingService();
  private suggestionService = new SuggestionService();
  private collectionService = new CollectionService();
  private viewRepo = AppDataSource.getRepository(RecipeView);

  private async recordView(userId: string, recipeId: string): Promise<void> {
    const existing = await this.viewRepo.findOne({ where: { userId, recipeId } });
    if (existing) {
      await this.viewRepo.save(existing); // @UpdateDateColumn auto-updates viewedAt
    } else {
      await this.viewRepo.save(this.viewRepo.create({ userId, recipeId }));
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const recipeData = req.body;

      // Parse ingredient quantities (handles fractions like "1/3", "2 1/2")
      if (recipeData.ingredients) {
        recipeData.ingredients = recipeData.ingredients.map((ing: any) => ({
          ...ing,
          quantity: parseFraction(ing.quantity),
        }));
      }

      // Auto-categorize if not already categorized
      if (!recipeData.categories || recipeData.categories.length === 0 || !recipeData.tags || recipeData.tags.length === 0) {
        const { categories, tags } = RecipeCategorizerService.autoCategorizRecipe(recipeData);
        if (!recipeData.categories || recipeData.categories.length === 0) {
          recipeData.categories = categories;
        }
        if (!recipeData.tags || recipeData.tags.length === 0) {
          recipeData.tags = tags;
        }
      }

      const recipe = await this.recipeService.create(req.userId!, recipeData);
      res.status(201).json(recipe);
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const rawQuery = req.query as Record<string, unknown>;
      const {
        page,
        pageSize,
        sortBy,
        sortOrder,
        query,
        difficulty,
        maxPrepTime,
        maxCookTime,
        minCalories,
        maxCalories,
        minProtein,
        maxProtein,
        minCarbohydrates,
        maxCarbohydrates,
        minFat,
        maxFat,
      } = rawQuery as Record<string, string | undefined>;

      const parseArrayParam = (key: string): string[] | undefined => {
        const val = rawQuery[key] !== undefined ? rawQuery[key] : rawQuery[`${key}[]`];
        if (!val) return undefined;
        const items = (Array.isArray(val) ? val : [val])
          .flatMap((v) => String(v).split(','))
          .map((s) => s.trim())
          .filter(Boolean);
        return items.length > 0 ? items : undefined;
      };

      const searchQuery = {
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
        sortBy,
        sortOrder: sortOrder as 'asc' | 'desc' | undefined,
        query,
        categories: parseArrayParam('categories'),
        tags: parseArrayParam('tags'),
        difficulty: difficulty as 'easy' | 'medium' | 'hard' | undefined,
        maxPrepTime: maxPrepTime ? parseInt(maxPrepTime, 10) : undefined,
        maxCookTime: maxCookTime ? parseInt(maxCookTime, 10) : undefined,
        includeIngredients: parseArrayParam('includeIngredients'),
        excludeIngredients: parseArrayParam('excludeIngredients'),
        minCalories: minCalories ? parseFloat(minCalories) : undefined,
        maxCalories: maxCalories ? parseFloat(maxCalories) : undefined,
        minProtein: minProtein ? parseFloat(minProtein) : undefined,
        maxProtein: maxProtein ? parseFloat(maxProtein) : undefined,
        minCarbohydrates: minCarbohydrates ? parseFloat(minCarbohydrates) : undefined,
        maxCarbohydrates: maxCarbohydrates ? parseFloat(maxCarbohydrates) : undefined,
        minFat: minFat ? parseFloat(minFat) : undefined,
        maxFat: maxFat ? parseFloat(maxFat) : undefined,
        source: parseArrayParam('source') as any,
      };

      const result = await this.recipeService.findAll(req.userId!, searchQuery);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getCategories(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const categories = await this.recipeService.getDistinctCategories(req.userId!);
      res.json(categories);
    } catch (error) {
      next(error);
    }
  }

  async findById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const recipe = await this.recipeService.findById(req.params.id, req.userId!);
      const userRating = await this.ratingService.getUserRating(req.userId!, req.params.id);
      const isFavorite = await this.collectionService.isFavorite(req.userId!, req.params.id);
      this.recordView(req.userId!, req.params.id).catch(() => {});
      res.json({ ...recipe, userRating, isFavorite });
    } catch (error) {
      next(error);
    }
  }

  async getRecentlyViewed(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const showAuthor = await SystemSettingsService.isShowRecipeAuthorEnabled();
      const views = await this.viewRepo.find({
        where: { userId: req.userId! },
        relations: { recipe: { ingredients: true, ...(showAuthor ? { user: true } : {}) } },
        order: { viewedAt: 'DESC' },
        take: Math.min(limit, 20),
      });
      const recipes = views
        .map((v: any) => v.recipe)
        .filter(Boolean)
        .map((r: any) => RecipeService.formatRecipeWithAuthor(r, showAuthor));
      res.json(recipes);
    } catch (error) {
      next(error);
    }
  }

  async getSuggestions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string) || 6;
      const suggestions = await this.suggestionService.getSuggestions(req.userId!, limit);
      res.json(suggestions);
    } catch (error) {
      next(error);
    }
  }

  async rate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { rating } = req.body;

      if (typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
      }

      const result = await this.ratingService.rate(req.userId!, req.params.id, rating);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async unrate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.ratingService.unrate(req.userId!, req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const recipeData = req.body;

      // Parse ingredient quantities (handles fractions like "1/3", "2 1/2")
      if (recipeData.ingredients) {
        recipeData.ingredients = recipeData.ingredients.map((ing: any) => ({
          ...ing,
          quantity: parseFraction(ing.quantity),
        }));
      }

      const recipe = await this.recipeService.update(req.params.id, req.userId!, recipeData);
      res.json(recipe);
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.recipeService.delete(req.params.id, req.userId!);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async importFromUrl(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
        throw new AppError(400, 'A valid recipe URL (http/https) is required');
      }

      const scrapedData = await this.scraperService.scrapeRecipe(url.trim());

      // Download and store scraped recipe image locally in unified recipe image storage
      if (scrapedData.imageUrl) {
        scrapedData.imageUrl = await ImageStorageService.localizeExternalImage(scrapedData.imageUrl);
      }

      const recipe = await this.recipeService.create(req.userId!, {
        ...scrapedData,
        sourceUrl: url.trim(),
      } as any);
      res.status(201).json(recipe);
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
      } else {
        next(new AppError(422, error.message || 'Failed to import recipe from URL'));
      }
    }
  }

  async generateWithAI(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resolution = await AIService.resolveProvider(req.userId);

      if (!resolution.ok) {
        return sendAIUnavailable(res, resolution);
      }

      const provider = resolution.provider;

      const { prompt, ingredients, dietary, cuisine, servings } = req.body;

      const generatedRecipe = await provider
        .generateRecipe(prompt, {
          ingredients,
          dietary,
          cuisine,
          servings,
        })
        .catch((err) => {
          throw providerError(err);
        });

      // Auto-categorize the AI-generated recipe if needed
      const { categories, tags } = RecipeCategorizerService.autoCategorizRecipe(generatedRecipe);

      const recipe = await this.recipeService.create(
        req.userId!,
        {
          ...generatedRecipe,
          categories: generatedRecipe.categories || categories,
          tags: generatedRecipe.tags || tags,
          ingredients: generatedRecipe.ingredients.map((ing, index) => ({
            ...ing,
            quantity: parseFraction(ing.quantity),
            order: index,
          })),
        } as any,
        true
      );

      // Auto-generate recipe image with AI if requested
      if (req.body.generateImage) {
        try {
          const { imageUrl } = await AIService.generateAndSaveRecipeImage({
            recipeId: recipe.id,
            title: recipe.title,
            description: recipe.description,
            cuisine,
            userId: req.userId,
          });
          recipe.imageUrl = imageUrl;
        } catch (imgErr: any) {
          console.warn('Failed to auto-generate image for AI recipe:', imgErr);
          // Do NOT swallow this: a recipe that looks complete while its
          // image silently failed is exactly how "recipe made, no image"
          // goes unnoticed. The recipe still returns 201, but the client
          // gets an honest imageError it can show the user.
          const message = String(imgErr?.message || 'Failed to generate recipe image');
          (recipe as any).imageError =
            message.length > 300 ? `${message.slice(0, 300)}…` : message;
        }
      }

      await AIService.consumeManagedCredit(req.userId);
      res.status(201).json(recipe);
    } catch (error) {
      next(error);
    }
  }

  async enhanceWithAI(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resolution = await AIService.resolveProvider(req.userId);

      if (!resolution.ok) {
        return sendAIUnavailable(res, resolution);
      }

      const provider = resolution.provider;

      const recipe = await this.recipeService.findById(req.params.id, req.userId!);
      const { enhancementType } = req.body;

      const enhancement = await provider
        .enhanceRecipe(recipe, enhancementType)
        .catch((err) => {
          throw providerError(err);
        });

      await AIService.consumeManagedCredit(req.userId);

      // Strip markdown code fences if the AI wrapped the JSON in them
      const cleaned = enhancement.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();

      // Parse the AI response into the structured format the frontend expects
      try {
        const parsed = JSON.parse(cleaned);
        res.json(parsed);
      } catch {
        // Fallback: if the AI didn't return valid JSON, structure it ourselves
        if (enhancementType === 'improve_instructions') {
          const lines = enhancement.split('\n').map((l: string) => l.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean);
          res.json({ improvedInstructions: lines });
        } else if (enhancementType === 'add_tips') {
          const lines = enhancement.split('\n').map((l: string) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
          res.json({ tips: lines });
        } else if (enhancementType === 'optimize_ingredients') {
          const lines = enhancement.split('\n').filter((l: string) => l.trim());
          const optimizations = lines.map((line: string) => ({
            original: '',
            suggestion: line.replace(/^[-•*]\s*/, '').trim(),
            reason: '',
          }));
          res.json({ optimizations });
        } else {
          res.json({ enhancement });
        }
      }
    } catch (error) {
      next(error);
    }
  }

  async uploadImage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      // Persist uploaded file in unified ImageStorageService (disk + PostgreSQL backup)
      const imageUrl = await ImageStorageService.persistUploadedDiskFile(
        'recipes',
        req.file.path,
        req.file.filename,
        req.file.mimetype
      );

      // If recipe ID is provided, update the recipe with the image
      if (req.params.id) {
        const recipe = await this.recipeService.update(req.params.id as string, req.userId!, {
          imageUrl,
        });
        return res.json({ imageUrl, recipe });
      }

      // Otherwise, just return the image URL for use during recipe creation
      res.json({ imageUrl });
    } catch (error) {
      next(error);
    }
  }

  async generateImage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // Image generation doesn't go through resolveProvider, so apply the
      // managed credit gate explicitly.
      const creditState = await AIService.getManagedCreditState(req.userId);
      if (creditState.metered && creditState.balance <= 0) {
        return res
          .status(402)
          .json({ error: AI_OUT_OF_CREDITS_MESSAGE, code: AI_OUT_OF_CREDITS_CODE });
      }

      const { prompt, title, description, cuisine, model } = req.body || {};
      const recipeId = req.params.id ? (req.params.id as string) : undefined;

      const result = await AIService.generateAndSaveRecipeImage({
        recipeId,
        title,
        description,
        cuisine,
        customPrompt: prompt,
        model,
        userId: req.userId,
      });

      await AIService.consumeManagedCredit(req.userId);
      res.json(result);
    } catch (error: any) {
      console.error('Recipe image generation error:', error);
      const status = error.statusCode || 500;
      res.status(status).json({
        error: error.message || 'Failed to generate recipe image with AI',
        ...(error.code
          ? { code: error.code }
          : status === 403
            ? { code: AI_KEY_REQUIRED_CODE }
            : {}),
      });
    }
  }

  async extractFromImages(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resolution = await AIService.resolveProvider(req.userId);

      if (!resolution.ok) {
        return sendAIUnavailable(res, resolution);
      }

      const provider = resolution.provider;

      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({ error: 'No files provided' });
      }

      const files = req.files as Express.Multer.File[];

      // Validate file count (max 5)
      if (files.length > 5) {
        return res.status(400).json({ error: 'Maximum 5 files allowed' });
      }

      const images: ImageInput[] = [];

      // Process each file
      for (const file of files) {
        const mimeType = file.mimetype;

        // Handle image files only
        if (mimeType.startsWith('image/')) {
          // Skip canvas validation for HEIC/HEIF files as canvas doesn't support them
          // AI providers (Google, OpenAI, Anthropic) can handle HEIC directly
          if (mimeType === 'image/heic' || mimeType === 'image/heif' ||
              mimeType === 'image/heic-sequence' || mimeType === 'image/heif-sequence') {
            images.push({
              data: file.buffer,
              mimeType: 'image/jpeg', // Tell AI provider to treat as JPEG for best compatibility
            });
          } else {
            const processedImage = await processImage(file.buffer, mimeType);
            images.push({
              data: processedImage.data,
              mimeType: processedImage.mimeType,
            });
          }
        } else {
          return res.status(400).json({
            error: `Unsupported file type: ${mimeType}. Only image files are supported.`
          });
        }
      }

      // Extract recipe using AI vision
      const generatedRecipe = await provider
        .extractRecipeFromImages(images)
        .catch((err) => {
          throw providerError(err);
        });

      // Auto-categorize the extracted recipe if needed
      const { categories, tags } = RecipeCategorizerService.autoCategorizRecipe(generatedRecipe);

      // Return the extracted recipe data for preview/editing
      // Don't save it yet - let the user review and edit first
      await AIService.consumeManagedCredit(req.userId);
      res.json({
        ...generatedRecipe,
        categories: generatedRecipe.categories || categories,
        tags: generatedRecipe.tags || tags,
        ingredients: generatedRecipe.ingredients?.map((ing, index) => ({
          ...ing,
          order: index,
        })) || [],
      });
    } catch (error: any) {
      // Check if it's an Ollama unsupported error
      if (error.message?.includes('not supported with Ollama')) {
        return res.status(400).json({
          error: 'Image-based recipe extraction requires OpenAI (GPT-4 Vision), Anthropic (Claude 3+), or Google (Gemini). Ollama does not support vision capabilities.',
        });
      }
      next(error);
    }
  }

  async extractFromText(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { text } = req.body || {};

      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Please paste recipe text to extract' });
      }

      // Per-user callers without a key get the standard 403 rather than a
      // silent downgrade to the heuristic parser, and metered callers out of
      // credits get the standard 402. Only a genuinely unconfigured instance
      // falls through to the heuristic parser inside the service.
      const resolution = await AIService.resolveProvider(req.userId);
      if (!resolution.ok && resolution.reason !== 'not-configured') {
        return sendAIUnavailable(res, resolution);
      }

      const generatedRecipe = await AIService.extractRecipeFromText(text.trim(), req.userId);

      // Auto-categorize the extracted recipe if needed
      const { categories, tags } = RecipeCategorizerService.autoCategorizRecipe(generatedRecipe);

      res.json({
        ...generatedRecipe,
        categories: generatedRecipe.categories?.length ? generatedRecipe.categories : categories,
        tags: generatedRecipe.tags?.length ? generatedRecipe.tags : tags,
        ingredients:
          generatedRecipe.ingredients?.map((ing: any, index: number) => ({
            ...ing,
            quantity: typeof ing.quantity === 'number' ? ing.quantity : parseFraction(ing.quantity),
            order: index,
          })) || [],
      });
    } catch (error: any) {
      next(error);
    }
  }

  async detectIngredientsFromImage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resolution = await AIService.resolveProvider(req.userId);

      if (!resolution.ok) {
        return sendAIUnavailable(res, resolution);
      }

      const provider = resolution.provider;

      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      const file = req.file;
      const mimeType = file.mimetype;

      // Handle image files only
      if (!mimeType.startsWith('image/')) {
        return res.status(400).json({
          error: `Unsupported file type: ${mimeType}. Only image files are supported.`
        });
      }

      // For HEIC/HEIF files, tell AI provider to treat as JPEG for best compatibility
      const effectiveMimeType = (mimeType === 'image/heic' || mimeType === 'image/heif' ||
                                  mimeType === 'image/heic-sequence' || mimeType === 'image/heif-sequence')
        ? 'image/jpeg'
        : mimeType;

      // Use the buffer directly from multer memory storage
      const ingredients = await provider
        .extractIngredientsFromImage({
          data: file.buffer,
          mimeType: effectiveMimeType,
        })
        .catch((err) => {
          throw providerError(err);
        });

      await AIService.consumeManagedCredit(req.userId);
      res.json({ ingredients });
    } catch (error: any) {
      // Check if it's an Ollama unsupported error
      if (error.message?.includes('vision AI') || error.message?.includes('vision capabilities')) {
        return res.status(400).json({
          error: 'Ingredient detection requires vision AI (OpenAI, Anthropic, or Google). Ollama does not support vision capabilities.',
        });
      }
      next(error);
    }
  }

  async bulkDelete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'No recipe IDs provided' });
      }

      const deletedCount = await this.recipeService.bulkDelete(ids, req.userId!);

      res.json({ deletedCount, message: `${deletedCount} recipe(s) deleted successfully` });
    } catch (error) {
      next(error);
    }
  }

  async bulkUpdate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { ids, tags, categories } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'No recipe IDs provided' });
      }

      if (!tags && !categories) {
        return res.status(400).json({ error: 'No updates provided (tags or categories)' });
      }

      const updatedCount = await this.recipeService.bulkUpdate(ids, req.userId!, { tags, categories });

      res.json({ updatedCount, message: `${updatedCount} recipe(s) updated successfully` });
    } catch (error) {
      next(error);
    }
  }
}
