import { Repository, In } from 'typeorm';
import { AppDataSource } from '../../db/data-source';
import { Recipe, Ingredient } from '../../db/entities';
import {
  RecipeCreateDto,
  RecipeUpdateDto,
  RecipeSearchQuery,
  PaginatedResponse,
  PAGINATION_DEFAULTS,
} from '@nommable/shared';
import { AppError } from '../../api/middleware';
import { GamificationService } from '../gamification/gamification.service';
import { SystemSettingsService } from '../settings/system-settings.service';
import { assertSafeExternalLink } from '../../utils/ssrf-guard';

/**
 * sourceUrl is rendered as a clickable link on the recipe detail page, so it
 * must be http(s) only: a stored `javascript:` URL would be clickable XSS.
 * Applies to manual creates/updates; imports are covered by the scraper's
 * SSRF guard (which also restricts to http/https).
 */
function assertSafeSourceUrl(sourceUrl: unknown): void {
  if (sourceUrl === undefined || sourceUrl === null || sourceUrl === '') return;
  if (typeof sourceUrl !== 'string') {
    throw new AppError(400, 'sourceUrl must be a string');
  }
  try {
    assertSafeExternalLink(sourceUrl);
  } catch {
    throw new AppError(400, 'sourceUrl must be an http or https URL');
  }
}

export class RecipeService {
  private recipeRepo: Repository<Recipe>;
  private ingredientRepo: Repository<Ingredient>;
  private gamificationService: GamificationService;

  constructor() {
    this.recipeRepo = AppDataSource.getRepository(Recipe);
    this.ingredientRepo = AppDataSource.getRepository(Ingredient);
    this.gamificationService = new GamificationService();
  }

  async create(userId: string, dto: RecipeCreateDto, isAiGenerated = false): Promise<Recipe> {
    assertSafeSourceUrl(dto.sourceUrl);
    const recipe = this.recipeRepo.create({
      userId,
      title: dto.title,
      description: dto.description,
      servings: dto.servings,
      prepTime: dto.prepTime,
      cookTime: dto.cookTime,
      totalTime: (dto.prepTime || 0) + (dto.cookTime || 0),
      difficulty: dto.difficulty,
      imageUrl: dto.imageUrl,
      sourceUrl: dto.sourceUrl,
      notes: dto.notes,
      instructions: dto.instructions,
      categories: dto.categories,
      tags: dto.tags,
      nutrition: dto.nutrition,
      isAiGenerated,
    });

    await this.recipeRepo.save(recipe);

    // Create ingredients
    if (dto.ingredients?.length) {
      const ingredients = dto.ingredients.map((ing) =>
        this.ingredientRepo.create({
          recipeId: recipe.id,
          quantity: ing.quantity,
          unit: ing.unit,
          name: ing.name,
          notes: ing.notes,
          section: ing.section,
          order: ing.order,
        })
      );
      await this.ingredientRepo.save(ingredients);
    }

    // Track recipe creation for achievements (includes manual, AI-generated, and imported recipes)
    await this.gamificationService.recordRecipeCreated(userId);

    return this.findById(recipe.id, userId);
  }

  static formatRecipeWithAuthor(recipe: Recipe, showAuthor: boolean): Recipe {
    if (!recipe) return recipe;
    const rawUser = (recipe as any).user;
    if (rawUser) {
      if (showAuthor) {
        (recipe as any).author = {
          id: rawUser.id,
          username: rawUser.username,
          firstName: rawUser.firstName || undefined,
          lastName: rawUser.lastName || undefined,
          profilePhotoUrl: rawUser.profilePhotoUrl || undefined,
        };
      }
      delete (recipe as any).user;
    }
    return recipe;
  }

  async findAll(userId: string, query: RecipeSearchQuery = {}): Promise<PaginatedResponse<Recipe>> {
    const page = Math.max(1, query.page ?? PAGINATION_DEFAULTS.page);
    const pageSize = Math.min(
      query.pageSize ?? PAGINATION_DEFAULTS.pageSize,
      PAGINATION_DEFAULTS.maxPageSize
    );
    const skip = (page - 1) * pageSize;
    const settings = await SystemSettingsService.getSettings();
    const sharedRecipes = settings.sharedRecipes;
    const showAuthor = settings.sharedRecipes && settings.showRecipeAuthor;

    const qb = this.recipeRepo
      .createQueryBuilder('recipe')
      .leftJoinAndSelect('recipe.ingredients', 'ingredients')
      .orderBy('recipe.createdAt', 'DESC');

    if (showAuthor) {
      qb.leftJoinAndSelect('recipe.user', 'authorUser');
    }

    if (!sharedRecipes) {
      qb.where('recipe.userId = :userId', { userId });
    }

    if (query.query) {
      qb.andWhere(
        "(LOWER(recipe.title) LIKE LOWER(:search) OR LOWER(COALESCE(recipe.description, '')) LIKE LOWER(:search) OR LOWER(COALESCE(recipe.tags, '')) LIKE LOWER(:search))",
        { search: `%${query.query}%` }
      );
    }

    if (query.difficulty) {
      qb.andWhere('recipe.difficulty = :difficulty', { difficulty: query.difficulty });
    }

    if (query.maxPrepTime) {
      qb.andWhere('recipe.prepTime <= :maxPrepTime', { maxPrepTime: query.maxPrepTime });
    }

    if (query.maxCookTime) {
      qb.andWhere('recipe.cookTime <= :maxCookTime', { maxCookTime: query.maxCookTime });
    }

    const expandFilterTerms = (terms: string[]): string[] => {
      const expanded = new Set<string>();
      for (const raw of terms) {
        const lower = raw.trim().toLowerCase();
        if (!lower) continue;
        expanded.add(lower);
        if (lower.endsWith('s') && lower.length > 3) {
          expanded.add(lower.slice(0, -1));
        } else if (!lower.endsWith('s')) {
          expanded.add(`${lower}s`);
        }
      }
      return Array.from(expanded);
    };

    if (query.categories?.length) {
      const categories = expandFilterTerms(query.categories);
      if (categories.length > 0) {
        qb.andWhere(
          `(
            (recipe.categories IS NOT NULL AND json_valid(recipe.categories) AND json_type(recipe.categories) = 'array' AND EXISTS (
              SELECT 1 FROM json_each(recipe.categories) AS cat WHERE LOWER(cat.value) IN (:...categories)
            ))
            OR
            (recipe.tags IS NOT NULL AND json_valid(recipe.tags) AND json_type(recipe.tags) = 'array' AND EXISTS (
              SELECT 1 FROM json_each(recipe.tags) AS tag WHERE LOWER(tag.value) IN (:...categories)
            ))
          )`,
          { categories }
        );
      }
    }

    if (query.tags?.length) {
      const tags = expandFilterTerms(query.tags);
      if (tags.length > 0) {
        qb.andWhere(
          `(
            (recipe.tags IS NOT NULL AND json_valid(recipe.tags) AND json_type(recipe.tags) = 'array' AND EXISTS (
              SELECT 1 FROM json_each(recipe.tags) AS tag WHERE LOWER(tag.value) IN (:...tags)
            ))
            OR
            (recipe.categories IS NOT NULL AND json_valid(recipe.categories) AND json_type(recipe.categories) = 'array' AND EXISTS (
              SELECT 1 FROM json_each(recipe.categories) AS cat WHERE LOWER(cat.value) IN (:...tags)
            ))
          )`,
          { tags }
        );
      }
    }

    // Ingredient include filter
    if (query.includeIngredients?.length) {
      for (let i = 0; i < query.includeIngredients.length; i++) {
        const paramName = `includeIng${i}`;
        qb.andWhere(
          `EXISTS (SELECT 1 FROM ingredients ing WHERE ing."recipe_id" = recipe.id AND LOWER(ing.name) LIKE LOWER(:${paramName}))`,
          { [paramName]: `%${query.includeIngredients[i]}%` }
        );
      }
    }

    // Ingredient exclude filter
    if (query.excludeIngredients?.length) {
      for (let i = 0; i < query.excludeIngredients.length; i++) {
        const paramName = `excludeIng${i}`;
        qb.andWhere(
          `NOT EXISTS (SELECT 1 FROM ingredients ing WHERE ing."recipe_id" = recipe.id AND LOWER(ing.name) LIKE LOWER(:${paramName}))`,
          { [paramName]: `%${query.excludeIngredients[i]}%` }
        );
      }
    }

    // Nutritional filters
    const nutritionFilters = [
      { field: 'calories', min: query.minCalories, max: query.maxCalories },
      { field: 'protein', min: query.minProtein, max: query.maxProtein },
      { field: 'carbohydrates', min: query.minCarbohydrates, max: query.maxCarbohydrates },
      { field: 'fat', min: query.minFat, max: query.maxFat },
    ];

    for (const { field, min, max } of nutritionFilters) {
      if (min !== undefined) {
        qb.andWhere(
          `(recipe.nutrition IS NOT NULL AND json_valid(recipe.nutrition) AND CAST(json_extract(recipe.nutrition, '$.${field}') AS REAL) >= :min${field})`,
          { [`min${field}`]: min }
        );
      }
      if (max !== undefined) {
        qb.andWhere(
          `(recipe.nutrition IS NOT NULL AND json_valid(recipe.nutrition) AND CAST(json_extract(recipe.nutrition, '$.${field}') AS REAL) <= :max${field})`,
          { [`max${field}`]: max }
        );
      }
    }

    // Source filter
    if (query.source?.length) {
      const conditions: string[] = [];
      if (query.source.includes('ai-generated')) conditions.push('recipe."is_ai_generated" = 1');
      if (query.source.includes('imported'))
        conditions.push('(recipe."is_ai_generated" = 0 AND recipe."source_url" IS NOT NULL)');
      if (query.source.includes('manual'))
        conditions.push('(recipe."is_ai_generated" = 0 AND recipe."source_url" IS NULL)');
      if (conditions.length) qb.andWhere(`(${conditions.join(' OR ')})`);
    }

    const [data, total] = await qb.skip(skip).take(pageSize).getManyAndCount();
    const formattedData = data.map((r) => RecipeService.formatRecipeWithAuthor(r, showAuthor));

    return {
      data: formattedData,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findById(id: string, userId: string): Promise<Recipe> {
    const settings = await SystemSettingsService.getSettings();
    const sharedRecipes = settings.sharedRecipes;
    const showAuthor = settings.sharedRecipes && settings.showRecipeAuthor;
    const recipe = await this.recipeRepo.findOne({
      where: sharedRecipes ? { id } : { id, userId },
      relations: showAuthor ? ['ingredients', 'user'] : ['ingredients'],
      order: { ingredients: { order: 'ASC' } },
    });

    if (!recipe) {
      throw new AppError(404, 'Recipe not found');
    }

    return RecipeService.formatRecipeWithAuthor(recipe, showAuthor);
  }

  async update(id: string, userId: string, dto: RecipeUpdateDto): Promise<Recipe> {
    const recipe = await this.findById(id, userId);
    delete (recipe as any).author;

    // Update recipe fields
    if (dto.title !== undefined) recipe.title = dto.title;
    if (dto.description !== undefined) recipe.description = dto.description;
    if (dto.servings !== undefined) recipe.servings = dto.servings;
    if (dto.prepTime !== undefined) recipe.prepTime = dto.prepTime;
    if (dto.cookTime !== undefined) recipe.cookTime = dto.cookTime;
    if (dto.difficulty !== undefined) recipe.difficulty = dto.difficulty;
    if (dto.imageUrl !== undefined) recipe.imageUrl = dto.imageUrl;
    if (dto.sourceUrl !== undefined) {
      assertSafeSourceUrl(dto.sourceUrl);
      recipe.sourceUrl = dto.sourceUrl;
    }
    if (dto.notes !== undefined) recipe.notes = dto.notes;
    if (dto.instructions !== undefined) recipe.instructions = dto.instructions;
    if (dto.categories !== undefined) recipe.categories = dto.categories;
    if (dto.tags !== undefined) recipe.tags = dto.tags;
    if (dto.nutrition !== undefined) recipe.nutrition = dto.nutrition;

    if (dto.prepTime !== undefined || dto.cookTime !== undefined) {
      recipe.totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);
    }

    await this.recipeRepo.save(recipe);

    // Update ingredients if provided
    if (dto.ingredients !== undefined) {
      // Delete old ingredients
      await this.ingredientRepo.delete({ recipeId: id });

      // Create new ingredients
      if (dto.ingredients.length) {
        const ingredients = dto.ingredients.map((ing) =>
          this.ingredientRepo.create({
            recipeId: id,
            quantity: ing.quantity,
            unit: ing.unit,
            name: ing.name,
            notes: ing.notes,
            section: ing.section,
            order: ing.order,
          })
        );
        await this.ingredientRepo.save(ingredients);
      }
    }

    return this.findById(id, userId);
  }

  async delete(id: string, userId: string): Promise<void> {
    const recipe = await this.findById(id, userId);
    await this.recipeRepo.remove(recipe);
  }

  async bulkDelete(ids: string[], userId: string): Promise<number> {
    const sharedRecipes = await SystemSettingsService.isSharedRecipesEnabled();
    const recipes = await this.recipeRepo.find({
      where: sharedRecipes
        ? { id: In(ids) }
        : {
            id: In(ids),
            userId,
          },
    });

    if (recipes.length === 0) {
      return 0;
    }

    await this.recipeRepo.remove(recipes);
    return recipes.length;
  }

  async getDistinctCategories(userId: string): Promise<string[]> {
    const sharedRecipes = await SystemSettingsService.isSharedRecipesEnabled();
    const recipes = await this.recipeRepo.find({
      where: sharedRecipes ? undefined : { userId },
      select: ['categories'],
    });

    const categories = new Set<string>();
    for (const r of recipes) {
      if (Array.isArray(r.categories)) {
        for (const cat of r.categories) {
          if (cat) categories.add(cat);
        }
      }
    }
    return Array.from(categories).sort();
  }

  async bulkUpdate(
    ids: string[],
    userId: string,
    updates: { tags?: string[]; categories?: string[] }
  ): Promise<number> {
    const sharedRecipes = await SystemSettingsService.isSharedRecipesEnabled();
    const recipes = await this.recipeRepo.find({
      where: sharedRecipes
        ? { id: In(ids) }
        : {
            id: In(ids),
            userId,
          },
    });

    if (recipes.length === 0) {
      return 0;
    }

    // Update each recipe
    recipes.forEach((recipe) => {
      if (updates.tags !== undefined) {
        // Merge tags (add new ones, keep existing)
        const existingTags = recipe.tags || [];
        recipe.tags = Array.from(new Set([...existingTags, ...updates.tags]));
      }
      if (updates.categories !== undefined) {
        // Merge categories (add new ones, keep existing)
        const existingCategories = recipe.categories || [];
        recipe.categories = Array.from(new Set([...existingCategories, ...updates.categories]));
      }
    });

    await this.recipeRepo.save(recipes);
    return recipes.length;
  }
}
