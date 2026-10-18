import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource, type MigrationInterface, type QueryRunner } from 'typeorm';
import { AppDataSource } from '../../db/data-source';
import { InitialSchema1788000000000 } from '../../db/migrations/1788000000000-InitialSchema';
import {
  EXPECTED_TABLES,
  UPGRADE_BASELINES,
  buildFixtureDb,
  dataSourceOptionsFor,
  readTableCounts,
} from './fixtures';

/**
 * Upgrade tests (issue #17): every release candidate must upgrade the
 * two prior supported versions. Each test builds a fixture database
 * for a baseline version (that version's migrations + seeded data),
 * then runs the CURRENT migration set against it — exactly what a real
 * upgrade does — and verifies the data survives and the schema matches.
 *
 * These tests use their own DataSources against throwaway files; they
 * never touch the shared AppDataSource the other test files use.
 */

function tempDbPath(): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'nommable-upgrade-test-'));
  return { dir, dbPath: join(dir, 'fixture.db') };
}

async function upgradeWithCurrentMigrations(dbPath: string): Promise<DataSource> {
  // migrationsRun stays true from AppDataSource.options: initialize()
  // runs the CURRENT migration set against the fixture, like a real
  // upgrade.
  const dataSource = new DataSource(dataSourceOptionsFor(dbPath));
  await dataSource.initialize();
  return dataSource;
}

describe.each(UPGRADE_BASELINES)('upgrade from $version', ({ version }) => {
  test('migrations apply, data survives, schema matches', async () => {
    const { dir, dbPath } = tempDbPath();
    try {
      const before = await buildFixtureDb(version, dbPath);
      expect(before.counts['recipes']).toBeGreaterThan(0);
      expect(before.counts['users']).toBeGreaterThan(0);

      const dataSource = await upgradeWithCurrentMigrations(dbPath);
      try {
        // (a) All migrations applied: the migrations table holds exactly
        // the current migration set, each recorded once.
        const applied = (await dataSource.query(
          `SELECT name FROM "migrations" ORDER BY name`,
        )) as Array<{ name: string }>;
        const currentNames = AppDataSource.migrations.map((m) => m.name).sort();
        expect(applied.map((r) => r.name)).toEqual(currentNames);

        // (b) Data survives: row counts identical in every table.
        const after = readTableCounts(dbPath);
        expect(after).toEqual(before.counts);

        // (c) Schema matches: every expected table exists.
        const tables = (await dataSource.query(
          `SELECT name FROM sqlite_master WHERE type = 'table'`,
        )) as Array<{ name: string }>;
        const present = new Set(tables.map((t) => t.name));
        for (const table of EXPECTED_TABLES) {
          expect(present.has(table)).toBe(true);
        }

        // Spot-checks on representative rows (values, not just counts).
        const recipe = await dataSource.query(
          `SELECT title, servings FROM "recipes" WHERE id = 'recipe-1'`,
        );
        expect(recipe).toEqual([{ title: 'Fixture Pasta', servings: 4 }]);
        const pantry = await dataSource.query(
          `SELECT quantity, is_low_stock FROM "pantry_items" WHERE id = 'pantry-2'`,
        );
        expect(pantry[0].quantity).toBeCloseTo(0.25);
        expect(pantry[0].is_low_stock).toBe(1);
        const admin = await dataSource.query(
          `SELECT email, username FROM "users" WHERE id = 'user-admin-1'`,
        );
        expect(admin).toEqual([{ email: 'admin@example.com', username: 'admin' }]);
        const instructions = await dataSource.query(
          `SELECT instructions FROM "recipes" WHERE id = 'recipe-1'`,
        );
        expect(JSON.parse(instructions[0].instructions)).toEqual([
          'Boil water.',
          'Cook pasta.',
        ]);
      } finally {
        if (dataSource.isInitialized) {
          await dataSource.destroy();
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('upgrade is idempotent: re-running migrations on an upgraded DB is a no-op', async () => {
    const { dir, dbPath } = tempDbPath();
    try {
      const before = await buildFixtureDb(version, dbPath);
      const first = await upgradeWithCurrentMigrations(dbPath);
      try {
        if (first.isInitialized) await first.destroy();
      } catch {
        // Ignore teardown errors; the second run below is the assertion.
      }
      const second = await upgradeWithCurrentMigrations(dbPath);
      try {
        expect(readTableCounts(dbPath)).toEqual(before.counts);
        const applied = (await second.query(
          `SELECT name FROM "migrations" ORDER BY name`,
        )) as Array<{ name: string }>;
        expect(applied.map((r) => r.name)).toEqual(
          AppDataSource.migrations.map((m) => m.name).sort(),
        );
      } finally {
        if (second.isInitialized) {
          await second.destroy();
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('upgrade atomicity', () => {
  /**
   * TypeORM's default `migrationsTransactionMode: 'all'` runs a whole
   * upgrade batch in a single transaction. Prove it: a migration that
   * creates a table and then throws must leave the database exactly as
   * it was — no partial table, no migrations-table row, no lost data.
   * This is the guarantee behind "not a half-migrated DB" (issue #17).
   */
  class FailingTestMigration implements MigrationInterface {
    name = 'FailingTestMigration1789000000000';

    async up(queryRunner: QueryRunner): Promise<void> {
      await queryRunner.query(
        `CREATE TABLE "failing_test_table" ("id" varchar PRIMARY KEY NOT NULL)`,
      );
      throw new Error('simulated migration failure');
    }

    async down(queryRunner: QueryRunner): Promise<void> {
      await queryRunner.query(`DROP TABLE IF EXISTS "failing_test_table"`);
    }
  }

  test('a failing migration rolls back the whole upgrade batch', async () => {
    const { dir, dbPath } = tempDbPath();
    try {
      const before = await buildFixtureDb('v1.1.0', dbPath);
      const dataSource = new DataSource(
        dataSourceOptionsFor(dbPath, {
          migrations: [InitialSchema1788000000000, FailingTestMigration],
          // Initialize WITHOUT running migrations, then run them
          // explicitly so the executor's own cleanup applies on failure.
          migrationsRun: false,
        }),
      );
      try {
        await dataSource.initialize();
        await expect(dataSource.runMigrations()).rejects.toThrow(
          'simulated migration failure',
        );
      } finally {
        if (dataSource.isInitialized) {
          await dataSource.destroy();
        }
      }
      // Database must be exactly as before the failed upgrade.
      expect(readTableCounts(dbPath)).toEqual(before.counts);
      const db = (await import('better-sqlite3')).default;
      const check = new db(dbPath, { readonly: true });
      try {
        const tables = check
          .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
          .all() as Array<{ name: string }>;
        expect(tables.map((t) => t.name)).not.toContain('failing_test_table');
        const applied = check
          .prepare(`SELECT name FROM "migrations"`)
          .all() as Array<{ name: string }>;
        expect(applied.map((r) => r.name)).toEqual([
          'InitialSchema1788000000000',
        ]);
      } finally {
        check.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
