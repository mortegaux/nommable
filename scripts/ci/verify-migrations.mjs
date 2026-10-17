#!/usr/bin/env node
/**
 * verify-migrations.mjs — CI migration gate.
 *
 * Runs the TypeORM migrations against a fresh throwaway SQLite database,
 * then opens that database and asserts every table the InitialSchema
 * migration creates actually exists, plus the migrations bookkeeping row.
 *
 * Self-contained: picks a temp DB path, dummy (non-production) secrets,
 * and cleans the temp file up on exit. Safe to run on any checkout after
 * `npm ci` — it never touches the real database.
 *
 * Usage: node scripts/ci/verify-migrations.mjs
 * Exit code 0 = migrations apply cleanly and the schema is complete.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// better-sqlite3 is a backend dependency; resolve it from the backend package.
const requireBackend = createRequire(join(ROOT, 'packages', 'backend', 'package.json'));

// Every table created by packages/backend/src/db/migrations/1788000000000-InitialSchema.ts,
// plus the TypeORM bookkeeping table. If a future migration adds a table,
// add its name here so the gate keeps proving the full schema.
const EXPECTED_TABLES = [
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

const dir = mkdtempSync(join(tmpdir(), 'nommable-migration-check-'));
const dbPath = join(dir, 'check.db');

try {
  console.log(`[migration-check] temp database: ${dbPath}`);
  const run = spawnSync(
    'npm',
    ['run', 'migration:run', '-w', 'packages/backend'],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        DB_PATH: dbPath,
        // Dummy secrets: this database is thrown away; these values are never real.
        BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
        ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      },
    },
  );
  if (run.status !== 0) {
    console.error('[migration-check] FAIL: migration:run exited non-zero');
    process.exit(run.status ?? 1);
  }

  const Database = requireBackend('better-sqlite3');
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all();
    const present = new Set(rows.map((r) => r.name));
    const missing = EXPECTED_TABLES.filter((t) => !present.has(t));
    if (missing.length > 0) {
      console.error(`[migration-check] FAIL: missing tables: ${missing.join(', ')}`);
      process.exit(1);
    }

    const applied = db
      .prepare("SELECT name FROM migrations WHERE name = 'InitialSchema1788000000000'")
      .get();
    if (!applied) {
      console.error('[migration-check] FAIL: migrations table has no InitialSchema row');
      process.exit(1);
    }

    console.log(
      `[migration-check] PASS: ${EXPECTED_TABLES.length} tables present, InitialSchema applied`,
    );
  } finally {
    db.close();
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
