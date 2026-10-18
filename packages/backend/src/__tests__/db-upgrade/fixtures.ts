import { existsSync, unlinkSync } from 'fs';
import Database from 'better-sqlite3';
import { DataSource, type MigrationInterface } from 'typeorm';
import type { BetterSqlite3ConnectionOptions } from 'typeorm/driver/better-sqlite3/BetterSqlite3ConnectionOptions';
import { AppDataSource } from '../../db/data-source';
import { InitialSchema1788000000000 } from '../../db/migrations/1788000000000-InitialSchema';

/**
 * Fixture databases for upgrade tests (issue #17).
 *
 * A "fixture database" is a SQLite file representing a real database
 * from a prior supported version: the migrations that version shipped,
 * applied in order, plus representative seeded rows across the tables.
 * The upgrade tests copy nothing from the current code into the
 * fixture except the pinned migration list — the upgrade itself is
 * then run by the CURRENT migration set, which is exactly what a real
 * upgrade does.
 *
 * No binary fixture files are checked in: fixtures are built
 * deterministically by `buildFixtureDb()` from the pinned per-version
 * migration lists below, so they are always reproducible and reviewable.
 *
 * Baselines (see docs/releases.md "Supported upgrade baselines"):
 * - v1.1.0: the first tagged release.
 * - v1.0.0: the initial package version (never tagged as a release).
 * Both shipped the same single migration — `InitialSchema` was added
 * 2026-10-13 and has never been edited since — so both baselines pin
 * the same migration set. They are kept as separate fixtures so the
 * harness already covers two baselines when a real schema migration
 * lands: at that point, extend the older baseline's list to stop at
 * that migration, not at the new one.
 *
 * Maintainer rule: NEVER edit a shipped migration. Always add a new
 * one. If a shipped migration ever has to be corrected, copy the old
 * version into this file's per-version lists first, or the "old"
 * fixtures will silently become new-schema fixtures and the upgrade
 * tests will prove nothing.
 */

export interface UpgradeBaseline {
  version: string;
  /** Migrations this version shipped, in order. */
  migrations: Array<new () => MigrationInterface>;
  note: string;
}

export const UPGRADE_BASELINES: UpgradeBaseline[] = [
  {
    version: 'v1.1.0',
    migrations: [InitialSchema1788000000000],
    note: 'First tagged release. Ships InitialSchema only.',
  },
  {
    version: 'v1.0.0',
    migrations: [InitialSchema1788000000000],
    note: 'Initial package version (never tagged). Same single migration.',
  },
];

/** Every table the migrations create, including TypeORM bookkeeping. Keep in sync with scripts/ci/verify-migrations.mjs. */
export const EXPECTED_TABLES = [
  'users',
  'recipes',
  'meal_plans',
  'shopping_lists',
  'ai_configs',
  'taxonomies',
  'user_invitations',
  'user_preferences',
  'user_stats',
  'user_achievements',
  'meal_plan_templates',
  'pantry_items',
  'recipe_collections',
  'feedback_reports',
  'ingredients',
  'meal_plan_recipes',
  'shopping_list_items',
  'template_meals',
  'batch_cooking_plans',
  'recipe_ratings',
  'recipe_collection_items',
  'recipe_views',
  // Better Auth tables
  'user',
  'session',
  'account',
  'verification',
  // TypeORM bookkeeping
  'migrations',
];

export interface FixtureSnapshot {
  version: string;
  dbPath: string;
  /** Row count per table, taken right after seeding. */
  counts: Record<string, number>;
}

/** Current app database options, re-pointed at `dbPath`, for test DataSources. */
export function dataSourceOptionsFor(
  dbPath: string,
  overrides: Partial<BetterSqlite3ConnectionOptions> = {},
): BetterSqlite3ConnectionOptions {
  return {
    ...(AppDataSource.options as BetterSqlite3ConnectionOptions),
    database: dbPath,
    ...overrides,
  };
}

/** Read row counts for every table in a database file. */
export function readTableCounts(dbPath: string): Record<string, number> {
  const db = new Database(dbPath, { readonly: true });
  try {
    const counts: Record<string, number> = {};
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    for (const { name } of tables) {
      counts[name] = (db.prepare(`SELECT COUNT(*) AS c FROM "${name}"`).get() as { c: number }).c;
    }
    return counts;
  } finally {
    db.close();
  }
}

const NOW = '2026-01-01T00:00:00.000Z';

/** Seed representative rows across the tables, in FK order. */
function seedFixtureData(db: Database.Database): void {
  const run = (sql: string, ...params: unknown[]) => {
    db.prepare(sql).run(...params);
  };
  const seed = () => {
    // Legacy app users table (FK target for most app tables).
    run(
      `INSERT INTO "users" ("id", "email", "username", "first_name", "last_name", "profile_photo_url", "role", "is_system_admin", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'user-admin-1', 'admin@example.com', 'admin', 'Ada', 'Admin', null, 'admin', 1, NOW, NOW,
    );
    run(
      `INSERT INTO "users" ("id", "email", "username", "first_name", "last_name", "profile_photo_url", "role", "is_system_admin", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'user-1', 'cook@example.com', 'cook', 'Cal', 'Cook', null, 'user', 0, NOW, NOW,
    );
    // Better Auth tables.
    run(
      `INSERT INTO "user" ("id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt", "username", "displayUsername", "role", "banned", "banReason", "banExpires") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'ba-user-1', 'Ada Admin', 'admin@example.com', 1, null, NOW, NOW, 'admin', 'admin', 'admin', 0, null, null,
    );
    run(
      `INSERT INTO "session" ("id", "expiresAt", "token", "createdAt", "updatedAt", "ipAddress", "userAgent", "userId", "impersonatedBy") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'session-1', '2026-01-08T00:00:00.000Z', 'session-token-1', NOW, NOW, '127.0.0.1', 'test-agent', 'ba-user-1', null,
    );
    run(
      `INSERT INTO "account" ("id", "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "scope", "password", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'account-1', 'admin', 'credential', 'ba-user-1', null, null, null, null, null, null, 'hashed-password', NOW, NOW,
    );
    run(
      `INSERT INTO "verification" ("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)`,
      'verification-1', 'admin@example.com', '123456', '2026-01-02T00:00:00.000Z', NOW, NOW,
    );
    // Recipes + ingredients (JSON-ish text columns, nullable columns).
    run(
      `INSERT INTO "recipes" ("id", "user_id", "title", "description", "servings", "prep_time", "cook_time", "total_time", "difficulty", "image_url", "source_url", "notes", "instructions", "categories", "tags", "nutrition", "is_ai_generated", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'recipe-1', 'user-admin-1', 'Fixture Pasta', 'Weeknight pasta.', 4, 15, 30, 45, 'medium', null, 'https://example.com/pasta', 'Family favorite.',
      JSON.stringify(['Boil water.', 'Cook pasta.']), JSON.stringify(['Italian']), JSON.stringify(['Vegetarian']),
      JSON.stringify({ calories: 520 }), 0, NOW, NOW,
    );
    run(
      `INSERT INTO "recipes" ("id", "user_id", "title", "description", "servings", "prep_time", "cook_time", "total_time", "difficulty", "image_url", "source_url", "notes", "instructions", "categories", "tags", "nutrition", "is_ai_generated", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'recipe-2', 'user-1', 'Fixture Salad', null, 2, 5, null, null, 'easy', null, null, null,
      JSON.stringify(['Toss greens.']), JSON.stringify([]), JSON.stringify([]), null, 1, NOW, NOW,
    );
    run(
      `INSERT INTO "ingredients" ("id", "recipe_id", "quantity", "unit", "name", "notes", "section", "estimatedCost", "order") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'ingredient-1', 'recipe-1', 500, 'g', 'Pasta', null, null, 1.25, 0,
    );
    run(
      `INSERT INTO "ingredients" ("id", "recipe_id", "quantity", "unit", "name", "notes", "section", "estimatedCost", "order") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'ingredient-2', 'recipe-1', 2, 'cloves', 'Garlic', 'Minced', null, null, 1,
    );
    run(
      `INSERT INTO "ingredients" ("id", "recipe_id", "quantity", "unit", "name", "notes", "section", "estimatedCost", "order") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'ingredient-3', 'recipe-2', null, null, 'Mixed greens', null, null, null, 0,
    );
    // Meal plans.
    run(
      `INSERT INTO "meal_plans" ("id", "user_id", "name", "description", "start_date", "end_date", "is_ai_generated", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'meal-plan-1', 'user-admin-1', 'Fixture Week', 'Test plan.', '2026-01-05', '2026-01-11', 0, NOW, NOW,
    );
    run(
      `INSERT INTO "meal_plan_recipes" ("id", "meal_plan_id", "recipe_id", "date", "meal_type", "servings", "notes") VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'mpr-1', 'meal-plan-1', 'recipe-1', '2026-01-05', 'dinner', 4, null,
    );
    run(
      `INSERT INTO "meal_plan_recipes" ("id", "meal_plan_id", "recipe_id", "date", "meal_type", "servings", "notes") VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'mpr-2', 'meal-plan-1', 'recipe-2', '2026-01-06', 'lunch', 2, 'Light lunch.',
    );
    // Shopping lists.
    run(
      `INSERT INTO "shopping_lists" ("id", "user_id", "name", "meal_plan_id", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?)`,
      'shopping-list-1', 'user-admin-1', 'Fixture Groceries', 'meal-plan-1', NOW, NOW,
    );
    run(
      `INSERT INTO "shopping_list_items" ("id", "shopping_list_id", "name", "quantity", "unit", "category", "checked", "notes", "recipe_id", "order") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'sli-1', 'shopping-list-1', 'Pasta', 500, 'g', 'Grains', 0, null, 'recipe-1', 0,
    );
    run(
      `INSERT INTO "shopping_list_items" ("id", "shopping_list_id", "name", "quantity", "unit", "category", "checked", "notes", "recipe_id", "order") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'sli-2', 'shopping-list-1', 'Garlic', 1, 'head', 'Produce', 1, null, null, 1,
    );
    run(
      `INSERT INTO "shopping_list_items" ("id", "shopping_list_id", "name", "quantity", "unit", "category", "checked", "notes", "recipe_id", "order") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'sli-3', 'shopping-list-1', 'Olive oil', null, null, null, 0, 'Extra virgin', null, 2,
    );
    // Pantry (expiring, low-stock, and null-heavy rows).
    run(
      `INSERT INTO "pantry_items" ("id", "user_id", "name", "quantity", "unit", "category", "location", "expiration_date", "purchase_date", "notes", "is_low_stock", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'pantry-1', 'user-admin-1', 'Milk', 1, 'L', 'Dairy', 'Refrigerator', '2026-01-03', '2025-12-30', null, 0, NOW, NOW,
    );
    run(
      `INSERT INTO "pantry_items" ("id", "user_id", "name", "quantity", "unit", "category", "location", "expiration_date", "purchase_date", "notes", "is_low_stock", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'pantry-2', 'user-admin-1', 'Olive Oil', 0.25, 'bottle', 'Oils', 'Pantry', null, null, null, 1, NOW, NOW,
    );
    run(
      `INSERT INTO "pantry_items" ("id", "user_id", "name", "quantity", "unit", "category", "location", "expiration_date", "purchase_date", "notes", "is_low_stock", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'pantry-3', 'user-1', 'Rice', 2, 'kg', 'Grains', null, null, null, null, 0, NOW, NOW,
    );
    // Taxonomies, AI config, feedback.
    run(
      `INSERT INTO "taxonomies" ("id", "user_id", "name", "type", "color", "sort_order", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'taxonomy-1', 'user-admin-1', 'Italian', 'category', '#e11d48', 0, NOW, NOW,
    );
    run(
      `INSERT INTO "taxonomies" ("id", "user_id", "name", "type", "color", "sort_order", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'taxonomy-2', 'user-admin-1', 'Vegetarian', 'tag', '#16a34a', 1, NOW, NOW,
    );
    run(
      `INSERT INTO "ai_configs" ("id", "user_id", "provider", "api_key", "model", "image_model", "image_api_key", "base_url", "enabled", "is_global", "ai_mode", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'ai-config-1', 'user-admin-1', 'openai', 'encrypted-key', 'gpt-4o-mini', null, null, null, 1, 0, 'shared', NOW, NOW,
    );
    run(
      `INSERT INTO "feedback_reports" ("id", "type", "summary", "details", "route", "user_agent", "viewport", "app_version", "user_id", "status", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'feedback-1', 'bug', 'Fixture feedback', 'Details here.', '/recipes', 'test-agent', '1280x800', '1.1.0', 'user-admin-1', 'open', NOW, NOW,
    );
    // Collections, ratings, views.
    run(
      `INSERT INTO "recipe_collections" ("id", "user_id", "name", "description", "is_favorites", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'collection-1', 'user-admin-1', 'Weeknight', 'Quick meals.', 0, NOW, NOW,
    );
    run(
      `INSERT INTO "recipe_collection_items" ("id", "collection_id", "recipe_id", "added_at") VALUES (?, ?, ?, ?)`,
      'rci-1', 'collection-1', 'recipe-1', NOW,
    );
    run(
      `INSERT INTO "recipe_ratings" ("id", "user_id", "recipe_id", "rating", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?)`,
      'rating-1', 'user-admin-1', 'recipe-1', 5, NOW, NOW,
    );
    run(
      `INSERT INTO "recipe_views" ("id", "user_id", "recipe_id", "viewed_at") VALUES (?, ?, ?, ?)`,
      'view-1', 'user-admin-1', 'recipe-1', NOW,
    );
    // Batch cooking.
    run(
      `INSERT INTO "batch_cooking_plans" ("id", "userId", "recipeId", "name", "description", "cookingDate", "batches", "servingsPerBatch", "storageMethod", "storageDuration", "reheatingInstructions", "prepNotes", "status", "prepChecklist", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'batch-1', 'user-admin-1', 'recipe-1', 'Sunday Batch', 'Prep for the week.', '2026-01-04', 2, 4, 'Freezer', 90, 'Thaw overnight.', 'Chop first.', 'planned',
      JSON.stringify(['Chop vegetables']), NOW, NOW,
    );
    // Templates.
    run(
      `INSERT INTO "meal_plan_templates" ("id", "user_id", "name", "description", "duration", "tags", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'template-1', 'user-admin-1', 'Fixture Template', 'Reusable week.', 7, JSON.stringify(['test']), NOW, NOW,
    );
    run(
      `INSERT INTO "template_meals" ("id", "template_id", "day_offset", "meal_type", "recipe_id", "servings", "notes") VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'tm-1', 'template-1', 0, 'dinner', 'recipe-1', 4, null,
    );
    // Per-user stats/preferences/achievements/invitations.
    run(
      `INSERT INTO "user_preferences" ("id", "userId", "dietaryRestrictions", "allergies", "dislikes", "favorites", "preferredCuisines", "skillLevel", "maxCookingTime", "householdSize", "spiceTolerance", "budgetLevel", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'prefs-1', 'user-admin-1', JSON.stringify(['Gluten-free']), JSON.stringify(['Peanuts']), JSON.stringify(['Cilantro']),
      JSON.stringify(['Pasta']), JSON.stringify(['Italian']), 'intermediate', 45, 2, 'medium', 'moderate', NOW, NOW,
    );
    run(
      `INSERT INTO "user_stats" ("id", "userId", "totalPoints", "currentStreak", "longestStreak", "lastCookingDate", "recipesCreated", "mealsCooked", "mealPlansCreated", "cookingModeUsed", "recipesShared", "level", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'stats-1', 'user-admin-1', 120, 3, 7, '2025-12-31', 2, 5, 1, 1, 0, 2, NOW, NOW,
    );
    run(
      `INSERT INTO "user_achievements" ("id", "userId", "achievementKey", "points", "progress", "target", "completed", "completedAt", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'ach-1', 'user-admin-1', 'first-recipe', 10, 1, 1, 1, NOW, NOW,
    );
    run(
      `INSERT INTO "user_invitations" ("id", "email", "invited_by_id", "role", "token", "expires_at", "accepted", "created_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'invite-1', 'guest@example.com', 'user-admin-1', 'user', 'invite-token-1', '2026-01-08T00:00:00.000Z', 0, NOW,
    );
  };
  db.transaction(seed)();
}

/**
 * Build a fixture database for `version` at `dbPath` (overwriting any
 * existing file there). Applies exactly that version's migrations via
 * TypeORM, then seeds representative data. Returns row counts taken
 * right after seeding, for the upgrade tests to compare against.
 */
export async function buildFixtureDb(version: string, dbPath: string): Promise<FixtureSnapshot> {
  const baseline = UPGRADE_BASELINES.find((b) => b.version === version);
  if (!baseline) {
    throw new Error(
      `Unknown fixture version "${version}". Known baselines: ${UPGRADE_BASELINES.map((b) => b.version).join(', ')}`,
    );
  }
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
  const dataSource = new DataSource(
    dataSourceOptionsFor(dbPath, {
      migrations: baseline.migrations,
      migrationsRun: true,
    }),
  );
  try {
    await dataSource.initialize();
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
  const db = new Database(dbPath);
  try {
    seedFixtureData(db);
  } finally {
    db.close();
  }
  return { version, dbPath, counts: readTableCounts(dbPath) };
}
