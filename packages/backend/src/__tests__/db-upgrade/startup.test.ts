import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../../db/data-source';
import { StartupError, initializeDatabase } from '../../db/startup';
import { buildFixtureDb, dataSourceOptionsFor } from './fixtures';

/**
 * Startup failure paths (issue #17): migration failures must produce a
 * clean startup error — never a hang, never a half-serving state.
 * These tests drive `initializeDatabase()` (the same function
 * `index.ts` uses) against throwaway databases.
 */

function tempDbPath(name: string): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'nommable-startup-test-'));
  return { dir, dbPath: join(dir, name) };
}

function testDataSource(dbPath: string): DataSource {
  return new DataSource(dataSourceOptionsFor(dbPath));
}

async function destroyQuietly(dataSource: DataSource): Promise<void> {
  try {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    } else {
      // A failed initialize() can leave a driver-level handle behind;
      // close it best-effort so the test worker exits cleanly.
      const driver = dataSource.driver as unknown as {
        databaseConnection?: { close?: () => void };
      };
      driver?.databaseConnection?.close?.();
    }
  } catch {
    // Ignore teardown errors.
  }
}

describe('initializeDatabase failure paths', () => {
  test('fresh database initializes successfully', async () => {
    const { dir, dbPath } = tempDbPath('fresh.db');
    const dataSource = testDataSource(dbPath);
    try {
      await expect(
        initializeDatabase(dataSource, { maxRetries: 1, retryDelayMs: 10 }),
      ).resolves.toBeUndefined();
      expect(dataSource.isInitialized).toBe(true);
      const tables = (await dataSource.query(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recipes'`,
      )) as Array<{ name: string }>;
      expect(tables).toEqual([{ name: 'recipes' }]);
    } finally {
      await destroyQuietly(dataSource);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('corrupt database file fails fast with a clear, actionable error', async () => {
    const { dir, dbPath } = tempDbPath('corrupt.db');
    writeFileSync(dbPath, 'this is not a sqlite database at all');
    const dataSource = testDataSource(dbPath);
    try {
      const error = await initializeDatabase(dataSource, {
        maxRetries: 2,
        retryDelayMs: 10,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(StartupError);
      expect((error as Error).message).toMatch(/corrupt|not a SQLite database/i);
      expect((error as Error).message).toMatch(/Do NOT delete the database file/);
    } finally {
      await destroyQuietly(dataSource);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('database migrated by a newer build fails fast with the downgrade error', async () => {
    const { dir, dbPath } = tempDbPath('newer.db');
    await buildFixtureDb('v1.1.0', dbPath);
    // Simulate a database migrated by a future release: a migrations
    // row this build does not know about.
    const raw = new Database(dbPath);
    try {
      raw
        .prepare(`INSERT INTO "migrations" ("timestamp", "name") VALUES (?, ?)`)
        .run(1789000000000, 'FutureMigration1789000000000');
    } finally {
      raw.close();
    }
    const dataSource = testDataSource(dbPath);
    try {
      await expect(
        initializeDatabase(dataSource, { maxRetries: 1, retryDelayMs: 10 }),
      ).rejects.toThrow(/NEWER than this build|FutureMigration1789000000000/);
    } finally {
      await destroyQuietly(dataSource);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('unreachable database retries, then fails with a clear error', async () => {
    const { dir } = tempDbPath('unreachable.db');
    // A regular file where the database directory should be: the
    // database can never be opened here (mkdir fails with ENOTDIR).
    // (A merely-missing directory would NOT be unreachable — TypeORM's
    // better-sqlite3 driver auto-creates it.)
    writeFileSync(join(dir, 'blocker'), 'a regular file, not a directory');
    const dbPath = join(dir, 'blocker', 'nommable.db');
    const dataSource = testDataSource(dbPath);
    try {
      const error = await initializeDatabase(dataSource, {
        maxRetries: 2,
        retryDelayMs: 10,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(StartupError);
      expect((error as Error).message).toMatch(/Could not connect/);
    } finally {
      await destroyQuietly(dataSource);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
