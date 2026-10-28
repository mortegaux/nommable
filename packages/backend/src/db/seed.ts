/**
 * Demo seed data for a FRESH Nommable database.
 *
 * HOW TO RUN (explicit only — this never runs on boot):
 *   1. Deploy the build that contains this file, so `dist/db/seed.js` exists.
 *   2. On the test instance, open the Render Dashboard -> service -> Shell.
 *      The container workdir is /app/packages/backend, so run:
 *        npm run seed
 *      (That is the `seed` script in packages/backend/package.json, which runs
 *      `node dist/db/seed.js` against the same database the app uses:
 *      /data/nommable.db on Render, or $DB_PATH when set.)
 *   3. Locally: `npm run build -w packages/backend && npm run seed -w packages/backend`.
 *
 * WHICH USER GETS THE DATA:
 *   - $SEED_USER_EMAIL when set (must already exist).
 *   - Otherwise the first user with role 'admin'.
 *   - Otherwise the first user by creation date.
 *   - If no users exist at all, the script aborts: run the setup wizard first.
 *   The script NEVER creates users, and never touches Better Auth tables.
 *
 * SAFETY / IDEMPOTENCY:
 *   - Nothing is ever deleted, overwritten, or wiped. Every section checks
 *     for existing rows first (by title/name/key, or by the table's unique
 *     constraint) and skips what is already there, so re-running is safe:
 *     on a fresh database everything is created; on a re-run everything
 *     reports "skipped" and nothing is duplicated.
 *   - No live AI generation is used (that would cost credits): seeded
 *     recipes have no images (imageUrl is left empty) and isAiGenerated
 *     is false.
 *
 * WHAT IT COVERS (one section per major feature):
 *   recipes (+ ingredients), pantry, shopping list, meal plan, collections,
 *   ratings, views, achievements, user stats, taxonomy (categories/tags),
 *   batch cooking plan, meal plan template.
 *   Deliberately NOT seeded: feedback reports, invitations, AI configs
 *   (never seed keys), user preferences (defaults are fine).
 */

import { initializeDatabase } from './startup';
import { AppDataSource } from './data-source';
import {
  User,
  Recipe,
  Ingredient,
  PantryItem,
  ShoppingList,
  ShoppingListItem,
  MealPlan,
  MealPlanRecipe,
  RecipeCollection,
  RecipeCollectionItem,
  RecipeRating,
  RecipeView,
  UserAchievement,
  UserStats,
  Taxonomy,
  BatchCookingPlan,
  MealPlanTemplate,
  TemplateMeal,
} from './entities';

const DEMO = 'Demo: ';

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Next occurrence of `weekday` (0 = Sunday), on or after `from`. */
function nextWeekdayOnOrAfter(from: Date, weekday: number): Date {
  const diff = (weekday - from.getDay() + 7) % 7;
  return addDays(from, diff);
}

interface SeedIngredient {
  name: string;
  quantity?: number;
  unit?: string;
}

interface SeedRecipe {
  title: string;
  description: string;
  servings: number;
  prepTime: number;
  cookTime: number;
  difficulty: string;
  categories: string[];
  tags: string[];
  instructions: string[];
  ingredients: SeedIngredient[];
  nutrition?: {
    calories?: number;
    protein?: number;
    carbohydrates?: number;
    fat?: number;
    fiber?: number;
    sugar?: number;
    sodium?: number;
  };
}

const RECIPES: SeedRecipe[] = [
  {
    title: `${DEMO}Weeknight Chicken Tacos`,
    description: 'Fast, smoky chicken tacos with lime and cilantro — the demo weeknight dinner.',
    servings: 4,
    prepTime: 15,
    cookTime: 15,
    difficulty: 'Easy',
    categories: ['Dinner', 'Quick'],
    tags: ['spicy', 'kid-friendly'],
    instructions: [
      'Toss the chicken with cumin, chili powder, and salt.',
      'Sear in an oiled skillet over medium-high heat until cooked through, about 6 minutes.',
      'Rest 5 minutes, then slice.',
      'Warm the tortillas and fill with chicken, onion, and cilantro.',
      'Finish with lime wedges and sour cream.',
    ],
    ingredients: [
      { name: 'Chicken breast', quantity: 1.5, unit: 'lb' },
      { name: 'Corn tortillas', quantity: 12, unit: 'item' },
      { name: 'Lime', quantity: 2, unit: 'item' },
      { name: 'Fresh cilantro', quantity: 0.5, unit: 'cup' },
      { name: 'Red onion', quantity: 1, unit: 'item' },
      { name: 'Ground cumin', quantity: 2, unit: 'tsp' },
      { name: 'Chili powder', quantity: 2, unit: 'tsp' },
      { name: 'Sour cream', quantity: 0.5, unit: 'cup' },
    ],
    nutrition: { calories: 520, protein: 38, carbohydrates: 34, fat: 18 },
  },
  {
    title: `${DEMO}Creamy Tomato Basil Pasta`,
    description: 'A one-pan vegetarian pasta in a silky tomato-basil sauce.',
    servings: 4,
    prepTime: 10,
    cookTime: 20,
    difficulty: 'Easy',
    categories: ['Dinner', 'Vegetarian'],
    tags: ['one-pot', 'kid-friendly'],
    instructions: [
      'Boil the pasta in salted water until al dente; reserve a cup of pasta water.',
      'Soften garlic in olive oil, then add tomatoes and simmer 10 minutes.',
      'Stir in cream and torn basil.',
      'Toss with pasta and parmesan, loosening with pasta water as needed.',
    ],
    ingredients: [
      { name: 'Penne pasta', quantity: 1, unit: 'lb' },
      { name: 'Canned crushed tomatoes', quantity: 28, unit: 'oz' },
      { name: 'Fresh basil', quantity: 1, unit: 'cup' },
      { name: 'Heavy cream', quantity: 0.5, unit: 'cup' },
      { name: 'Garlic', quantity: 3, unit: 'clove' },
      { name: 'Parmesan cheese', quantity: 0.5, unit: 'cup' },
    ],
    nutrition: { calories: 610, protein: 18, carbohydrates: 72, fat: 26 },
  },
  {
    title: `${DEMO}Sheet-Pan Lemon Salmon`,
    description: 'Salmon and asparagus roasted together with lemon and dill.',
    servings: 4,
    prepTime: 10,
    cookTime: 15,
    difficulty: 'Easy',
    categories: ['Dinner'],
    tags: [],
    instructions: [
      'Heat the oven to 425°F and line a sheet pan.',
      'Arrange salmon and asparagus on the pan; drizzle with olive oil.',
      'Season with salt, pepper, and lemon zest.',
      'Roast 12–15 minutes until the salmon flakes easily.',
      'Finish with lemon juice and fresh dill.',
    ],
    ingredients: [
      { name: 'Salmon fillets', quantity: 4, unit: 'item' },
      { name: 'Asparagus', quantity: 1, unit: 'bunch' },
      { name: 'Lemon', quantity: 1, unit: 'item' },
      { name: 'Olive oil', quantity: 2, unit: 'tbsp' },
      { name: 'Fresh dill', quantity: 2, unit: 'tbsp' },
    ],
  },
  {
    title: `${DEMO}Veggie Stir-Fry Noodles`,
    description: 'Crisp vegetables and noodles in a ginger-soy sauce.',
    servings: 4,
    prepTime: 15,
    cookTime: 10,
    difficulty: 'Easy',
    categories: ['Dinner', 'Quick'],
    tags: ['spicy'],
    instructions: [
      'Cook the noodles, drain, and toss with a little sesame oil.',
      'Stir-fry bell pepper and broccoli over high heat until crisp-tender.',
      'Add ginger, garlic, and soy sauce.',
      'Toss with noodles and serve with sesame seeds.',
    ],
    ingredients: [
      { name: 'Rice noodles', quantity: 8, unit: 'oz' },
      { name: 'Bell pepper', quantity: 2, unit: 'item' },
      { name: 'Broccoli', quantity: 1, unit: 'head' },
      { name: 'Soy sauce', quantity: 3, unit: 'tbsp' },
      { name: 'Fresh ginger', quantity: 1, unit: 'tbsp' },
      { name: 'Sesame oil', quantity: 1, unit: 'tbsp' },
    ],
  },
  {
    title: `${DEMO}Classic Pancakes`,
    description: 'Fluffy weekend pancakes with maple syrup.',
    servings: 4,
    prepTime: 10,
    cookTime: 15,
    difficulty: 'Easy',
    categories: ['Breakfast'],
    tags: ['kid-friendly'],
    instructions: [
      'Whisk flour, baking powder, and salt.',
      'Whisk in eggs and milk until just combined.',
      'Ladle onto a buttered griddle over medium heat.',
      'Flip when bubbles appear, about 2 minutes per side.',
      'Serve with butter and maple syrup.',
    ],
    ingredients: [
      { name: 'All-purpose flour', quantity: 2, unit: 'cup' },
      { name: 'Eggs', quantity: 2, unit: 'item' },
      { name: 'Milk', quantity: 1.5, unit: 'cup' },
      { name: 'Baking powder', quantity: 2, unit: 'tsp' },
      { name: 'Butter', quantity: 2, unit: 'tbsp' },
      { name: 'Maple syrup', quantity: 0.5, unit: 'cup' },
    ],
  },
  {
    title: `${DEMO}Hearty Beef Chili`,
    description: 'Slow-simmered one-pot chili, built for batch cooking.',
    servings: 6,
    prepTime: 20,
    cookTime: 60,
    difficulty: 'Medium',
    categories: ['Dinner'],
    tags: ['one-pot', 'spicy'],
    instructions: [
      'Brown the beef with onion, then drain excess fat.',
      'Stir in chili powder and cumin until fragrant.',
      'Add beans and tomatoes; simmer 45–60 minutes.',
      'Season to taste and serve with your favorite toppings.',
    ],
    ingredients: [
      { name: 'Ground beef', quantity: 2, unit: 'lb' },
      { name: 'Kidney beans', quantity: 2, unit: 'can' },
      { name: 'Canned diced tomatoes', quantity: 28, unit: 'oz' },
      { name: 'Yellow onion', quantity: 1, unit: 'item' },
      { name: 'Chili powder', quantity: 3, unit: 'tbsp' },
      { name: 'Ground cumin', quantity: 2, unit: 'tsp' },
    ],
  },
];

interface SeedPantryItem {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  location?: string;
  expirationInDays?: number;
  isLowStock?: boolean;
  notes?: string;
}

const PANTRY: SeedPantryItem[] = [
  { name: 'Chicken breast', quantity: 0.5, unit: 'lb', category: 'Meat & Seafood', location: 'Freezer', isLowStock: true, notes: 'Demo low-stock item' },
  { name: 'Corn tortillas', quantity: 12, unit: 'item', category: 'Grains & Pasta', location: 'Pantry' },
  { name: 'Rice', quantity: 5, unit: 'lb', category: 'Grains & Pasta', location: 'Pantry' },
  { name: 'Penne pasta', quantity: 2, unit: 'lb', category: 'Grains & Pasta', location: 'Pantry' },
  { name: 'Canned crushed tomatoes', quantity: 3, unit: 'can', category: 'Canned Goods', location: 'Pantry' },
  { name: 'Olive oil', quantity: 1, unit: 'bottle', category: 'Oils & Vinegars', location: 'Pantry' },
  { name: 'Soy sauce', quantity: 1, unit: 'bottle', category: 'Condiments', location: 'Pantry' },
  { name: 'Eggs', quantity: 12, unit: 'item', category: 'Dairy', location: 'Fridge' },
  { name: 'Milk', quantity: 0.5, unit: 'gal', category: 'Dairy', location: 'Fridge', expirationInDays: 2, notes: 'Demo expiring-soon item' },
  { name: 'Butter', quantity: 1, unit: 'lb', category: 'Dairy', location: 'Fridge' },
  { name: 'Yellow onion', quantity: 3, unit: 'item', category: 'Produce', location: 'Pantry' },
  { name: 'Garlic', quantity: 1, unit: 'head', category: 'Produce', location: 'Pantry' },
];

async function main(): Promise<void> {
  await initializeDatabase();
  const counts: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const bump = (section: string, created: boolean) => {
    if (created) counts[section] = (counts[section] ?? 0) + 1;
    else skipped[section] = (skipped[section] ?? 0) + 1;
  };

  const userRepo = AppDataSource.getRepository(User);
  const targetEmail = (process.env.SEED_USER_EMAIL || '').trim();
  let user: User | null = null;
  if (targetEmail) {
    user = await userRepo.findOne({ where: { email: targetEmail } });
    if (!user) {
      throw new Error(`SEED_USER_EMAIL user not found: ${targetEmail}`);
    }
  } else {
    const users = await userRepo.find({ order: { createdAt: 'ASC' } });
    user =
      users.find((u) => (u.role as unknown as string) === 'admin') ??
      users[0] ??
      null;
  }
  if (!user) {
    throw new Error(
      'No users exist yet — run the setup wizard first, then re-run the seed.',
    );
  }
  const userId = user.id;
  console.log(`Seeding demo data for user ${user.username} (${user.email})`);

  // ---- Recipes (+ ingredients) ----
  const recipeRepo = AppDataSource.getRepository(Recipe);
  const ingredientRepo = AppDataSource.getRepository(Ingredient);
  const recipesByTitle = new Map<string, Recipe>();
  for (const r of RECIPES) {
    const existing = await recipeRepo.findOne({ where: { userId, title: r.title } });
    if (existing) {
      recipesByTitle.set(r.title, existing);
      bump('recipes', false);
      continue;
    }
    const recipe = await recipeRepo.save(
      recipeRepo.create({
        userId,
        title: r.title,
        description: r.description,
        servings: r.servings,
        prepTime: r.prepTime,
        cookTime: r.cookTime,
        totalTime: r.prepTime + r.cookTime,
        difficulty: r.difficulty,
        instructions: r.instructions,
        categories: r.categories,
        tags: r.tags,
        nutrition: r.nutrition,
        isAiGenerated: false,
      }),
    );
    for (let i = 0; i < r.ingredients.length; i++) {
      const ing = r.ingredients[i];
      await ingredientRepo.save(
        ingredientRepo.create({
          recipeId: recipe.id,
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          order: i,
        }),
      );
    }
    recipesByTitle.set(r.title, recipe);
    bump('recipes', true);
  }
  const recipe = (title: string): Recipe => {
    const found = recipesByTitle.get(title);
    if (!found) throw new Error(`Seed recipe missing: ${title}`);
    return found;
  };

  // ---- Pantry ----
  const pantryRepo = AppDataSource.getRepository(PantryItem);
  const now = today();
  for (const p of PANTRY) {
    const existing = await pantryRepo.findOne({ where: { userId, name: p.name } });
    if (existing) {
      bump('pantry', false);
      continue;
    }
    await pantryRepo.save(
      pantryRepo.create({
        userId,
        name: p.name,
        quantity: p.quantity,
        unit: p.unit,
        category: p.category,
        location: p.location,
        expirationDate:
          p.expirationInDays !== undefined ? addDays(now, p.expirationInDays) : undefined,
        isLowStock: p.isLowStock ?? false,
        notes: p.notes,
      }),
    );
    bump('pantry', true);
  }

  // ---- Shopping list ----
  const listRepo = AppDataSource.getRepository(ShoppingList);
  const listItemRepo = AppDataSource.getRepository(ShoppingListItem);
  const listName = `${DEMO}Weekly Shop`;
  let list = await listRepo.findOne({ where: { userId, name: listName } });
  if (!list) {
    list = await listRepo.save(listRepo.create({ userId, name: listName }));
    bump('shopping_lists', true);
    const items: Array<{ name: string; quantity?: number; unit?: string; category?: string; checked?: boolean; recipeId?: string }> = [
      { name: 'Chicken breast', quantity: 2, unit: 'lb', category: 'Meat & Seafood', recipeId: recipe(`${DEMO}Weeknight Chicken Tacos`).id },
      { name: 'Avocados', quantity: 3, unit: 'item', category: 'Produce' },
      { name: 'Limes', quantity: 4, unit: 'item', category: 'Produce', checked: true },
      { name: 'Tortilla chips', quantity: 1, unit: 'bag', category: 'Snacks', checked: true },
      { name: 'Salmon fillets', quantity: 4, unit: 'item', category: 'Meat & Seafood', recipeId: recipe(`${DEMO}Sheet-Pan Lemon Salmon`).id },
      { name: 'Asparagus', quantity: 1, unit: 'bunch', category: 'Produce' },
      { name: 'Rice noodles', quantity: 2, unit: 'pack', category: 'Grains & Pasta' },
      { name: 'Maple syrup', quantity: 1, unit: 'bottle', category: 'Condiments' },
    ];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await listItemRepo.save(
        listItemRepo.create({
          shoppingListId: list.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          checked: item.checked ?? false,
          recipeId: item.recipeId,
          order: i,
        }),
      );
    }
    bump('shopping_list_items', true);
  } else {
    bump('shopping_lists', false);
  }

  // ---- Meal plan ----
  const mealPlanRepo = AppDataSource.getRepository(MealPlan);
  const mealPlanRecipeRepo = AppDataSource.getRepository(MealPlanRecipe);
  const planName = `${DEMO}Week of Dinners`;
  let plan = await mealPlanRepo.findOne({ where: { userId, name: planName } });
  if (!plan) {
    const start = nextWeekdayOnOrAfter(now, 1); // Monday
    plan = await mealPlanRepo.save(
      mealPlanRepo.create({
        userId,
        name: planName,
        description: 'Demo week of dinners built from the demo recipes.',
        startDate: start,
        endDate: addDays(start, 6),
        isAiGenerated: false,
      }),
    );
    bump('meal_plans', true);
    const meals: Array<{ dayOffset: number; mealType: string; title: string }> = [
      { dayOffset: 0, mealType: 'dinner', title: `${DEMO}Weeknight Chicken Tacos` },
      { dayOffset: 1, mealType: 'dinner', title: `${DEMO}Creamy Tomato Basil Pasta` },
      { dayOffset: 2, mealType: 'dinner', title: `${DEMO}Sheet-Pan Lemon Salmon` },
      { dayOffset: 3, mealType: 'dinner', title: `${DEMO}Veggie Stir-Fry Noodles` },
      { dayOffset: 4, mealType: 'dinner', title: `${DEMO}Hearty Beef Chili` },
      { dayOffset: 5, mealType: 'lunch', title: `${DEMO}Classic Pancakes` },
    ];
    for (const m of meals) {
      await mealPlanRecipeRepo.save(
        mealPlanRecipeRepo.create({
          mealPlanId: plan.id,
          recipeId: recipe(m.title).id,
          date: addDays(start, m.dayOffset),
          mealType: m.mealType,
          servings: 4,
        }),
      );
    }
    bump('meal_plan_meals', true);
  } else {
    bump('meal_plans', false);
  }

  // ---- Collections ----
  const collectionRepo = AppDataSource.getRepository(RecipeCollection);
  const collectionItemRepo = AppDataSource.getRepository(RecipeCollectionItem);
  const collections: Array<{ name: string; description: string; isFavorites: boolean; titles: string[] }> = [
    {
      name: `${DEMO}Favorites`,
      description: 'Demo favorites collection.',
      isFavorites: true,
      titles: [`${DEMO}Weeknight Chicken Tacos`, `${DEMO}Sheet-Pan Lemon Salmon`],
    },
    {
      name: `${DEMO}Weeknight Wins`,
      description: 'Demo fast weeknight recipes.',
      isFavorites: false,
      titles: [`${DEMO}Weeknight Chicken Tacos`, `${DEMO}Creamy Tomato Basil Pasta`, `${DEMO}Veggie Stir-Fry Noodles`],
    },
  ];
  for (const c of collections) {
    let collection = await collectionRepo.findOne({ where: { userId, name: c.name } });
    if (!collection) {
      collection = await collectionRepo.save(
        collectionRepo.create({
          userId,
          name: c.name,
          description: c.description,
          isFavorites: c.isFavorites,
        }),
      );
      bump('collections', true);
    } else {
      bump('collections', false);
    }
    for (const title of c.titles) {
      const rid = recipe(title).id;
      const existing = await collectionItemRepo.findOne({
        where: { collectionId: collection.id, recipeId: rid },
      });
      if (!existing) {
        await collectionItemRepo.save(
          collectionItemRepo.create({ collectionId: collection.id, recipeId: rid }),
        );
        bump('collection_items', true);
      } else {
        bump('collection_items', false);
      }
    }
  }

  // ---- Ratings + views ----
  const ratingRepo = AppDataSource.getRepository(RecipeRating);
  const viewRepo = AppDataSource.getRepository(RecipeView);
  const ratings: Array<{ title: string; rating: number }> = [
    { title: `${DEMO}Weeknight Chicken Tacos`, rating: 5 },
    { title: `${DEMO}Creamy Tomato Basil Pasta`, rating: 4 },
    { title: `${DEMO}Sheet-Pan Lemon Salmon`, rating: 5 },
  ];
  for (const r of ratings) {
    const rid = recipe(r.title).id;
    const existing = await ratingRepo.findOne({ where: { userId, recipeId: rid } });
    if (!existing) {
      await ratingRepo.save(ratingRepo.create({ userId, recipeId: rid, rating: r.rating }));
      bump('ratings', true);
    } else {
      bump('ratings', false);
    }
    const viewed = await viewRepo.findOne({ where: { userId, recipeId: rid } });
    if (!viewed) {
      await viewRepo.save(viewRepo.create({ userId, recipeId: rid }));
      bump('views', true);
    } else {
      bump('views', false);
    }
  }

  // ---- Achievements + user stats ----
  const achievementRepo = AppDataSource.getRepository(UserAchievement);
  const achievements: Array<{ key: string; points: number; progress: number; target: number; completed: boolean }> = [
    { key: 'first_recipe', points: 10, progress: 1, target: 1, completed: true },
    { key: 'week_streak_7', points: 0, progress: 3, target: 7, completed: false },
  ];
  for (const a of achievements) {
    const existing = await achievementRepo.findOne({ where: { userId, achievementKey: a.key } });
    if (!existing) {
      await achievementRepo.save(
        achievementRepo.create({
          userId,
          achievementKey: a.key,
          points: a.points,
          progress: a.progress,
          target: a.target,
          completed: a.completed,
          completedAt: a.completed ? new Date() : undefined,
        }),
      );
      bump('achievements', true);
    } else {
      bump('achievements', false);
    }
  }
  const statsRepo = AppDataSource.getRepository(UserStats);
  const stats = await statsRepo.findOne({ where: { userId } });
  if (!stats) {
    await statsRepo.save(
      statsRepo.create({
        userId,
        totalPoints: 10,
        currentStreak: 3,
        longestStreak: 7,
        lastCookingDate: now,
        recipesCreated: RECIPES.length,
        mealsCooked: 5,
        mealPlansCreated: 1,
        cookingModeUsed: 2,
        recipesShared: 0,
        level: 1,
      }),
    );
    bump('user_stats', true);
  } else {
    bump('user_stats', false);
  }

  // ---- Taxonomy (categories + tags) ----
  const taxonomyRepo = AppDataSource.getRepository(Taxonomy);
  const taxonomies: Array<{ name: string; type: 'category' | 'tag'; color?: string }> = [
    { name: 'Dinner', type: 'category', color: '#e07856' },
    { name: 'Quick', type: 'category', color: '#4caf7d' },
    { name: 'Vegetarian', type: 'category', color: '#7cb342' },
    { name: 'spicy', type: 'tag' },
    { name: 'one-pot', type: 'tag' },
    { name: 'kid-friendly', type: 'tag' },
  ];
  for (const t of taxonomies) {
    const existing = await taxonomyRepo.findOne({
      where: { userId, name: t.name, type: t.type },
    });
    if (!existing) {
      await taxonomyRepo.save(
        taxonomyRepo.create({ userId, name: t.name, type: t.type, color: t.color }),
      );
      bump('taxonomy', true);
    } else {
      bump('taxonomy', false);
    }
  }

  // ---- Batch cooking plan ----
  const batchRepo = AppDataSource.getRepository(BatchCookingPlan);
  const batchName = `${DEMO}Sunday Chili Batch`;
  const batchExisting = await batchRepo.findOne({ where: { userId, name: batchName } });
  if (!batchExisting) {
    await batchRepo.save(
      batchRepo.create({
        userId,
        recipeId: recipe(`${DEMO}Hearty Beef Chili`).id,
        name: batchName,
        description: 'Demo batch plan: cook once, freeze for the week.',
        cookingDate: nextWeekdayOnOrAfter(now, 0), // Sunday
        batches: 2,
        servingsPerBatch: 4,
        storageMethod: 'freeze',
        storageDuration: 30,
        reheatingInstructions: 'Thaw overnight in the fridge, then reheat gently on the stove.',
        prepNotes: 'Demo prep notes.',
        status: 'planned',
        prepChecklist: [
          { task: 'Brown the beef', completed: true, order: 0 },
          { task: 'Simmer the chili', completed: false, order: 1 },
          { task: 'Portion and freeze', completed: false, order: 2 },
        ],
      }),
    );
    bump('batch_plans', true);
  } else {
    bump('batch_plans', false);
  }

  // ---- Meal plan template ----
  const templateRepo = AppDataSource.getRepository(MealPlanTemplate);
  const templateMealRepo = AppDataSource.getRepository(TemplateMeal);
  const templateName = `${DEMO}Workweek Dinners`;
  let template = await templateRepo.findOne({ where: { userId, name: templateName } });
  if (!template) {
    template = await templateRepo.save(
      templateRepo.create({
        userId,
        name: templateName,
        description: 'Demo 5-day dinner template.',
        duration: 5,
        tags: ['dinner', 'weeknight'],
      }),
    );
    bump('meal_plan_templates', true);
    const templateMeals: Array<{ dayOffset: number; title: string }> = [
      { dayOffset: 0, title: `${DEMO}Weeknight Chicken Tacos` },
      { dayOffset: 1, title: `${DEMO}Creamy Tomato Basil Pasta` },
      { dayOffset: 2, title: `${DEMO}Sheet-Pan Lemon Salmon` },
    ];
    for (const m of templateMeals) {
      await templateMealRepo.save(
        templateMealRepo.create({
          templateId: template.id,
          dayOffset: m.dayOffset,
          mealType: 'dinner',
          recipeId: recipe(m.title).id,
          servings: 4,
        }),
      );
    }
    bump('template_meals', true);
  } else {
    bump('meal_plan_templates', false);
  }

  console.log('Seed complete. Created:', JSON.stringify(counts), 'Skipped (already existed):', JSON.stringify(skipped));
}

main()
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
    } catch {
      // Ignore teardown errors; the exit code above already reflects success/failure.
    }
  });
