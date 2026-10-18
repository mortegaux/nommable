import Database from 'better-sqlite3';
import type { DataSource } from 'typeorm';
import { AppDataSource } from './data-source';

/**
 * Startup database initialization (issue #17).
 *
 * Before this module, `index.ts` retried `AppDataSource.initialize()` five
 * times for every failure and labelled them all "Failed to connect to
 * database". That is wrong for migration failures: a failed migration is
 * deterministic — retrying it five times just burns ~12s and then exits
 * with a message that sends the operator chasing a connection problem
 * that does not exist.
 *
 * `initializeDatabase()` classifies the failure instead:
 * - Database reachable + initialize failed  -> migration failure.
 *   Fail fast (no retries) with an actionable error. TypeORM runs all
 *   pending migrations in a single transaction by default
 *   (`migrationsTransactionMode: 'all'`), so a failed upgrade batch
 *   rolls back entirely — the database is left in its pre-upgrade
 *   state, never half-migrated. See the atomicity test in
 *   `src/__tests__/db-upgrade/db-upgrade.test.ts`.
 * - Database file corrupt / not a SQLite database -> fail fast with an
 *   actionable error (restore from backup; do NOT delete the file).
 * - Database unreachable (locked, missing directory, permissions) ->
 *   transient: retry up to `maxRetries` with `retryDelayMs` between
 *   attempts, then fail with a clear error.
 *
 * It also runs the downgrade guard: if the database records migrations
 * this build does not know about, the image was rolled back without
 * restoring the database. The app refuses to start against a newer
 * schema instead of silently running mismatched code. The app never
 * runs down-migrations; rollback means redeploying the matching image
 * or restoring the pre-upgrade backup (see docs/releases.md).
 */
export class StartupError extends Error {
  public readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StartupError';
    this.cause = cause;
  }
}

export interface InitializeDatabaseOptions {
  /** Connection-error retries. Default 5 (matches the old bootstrap loop). */
  maxRetries?: number;
  /** Delay between connection-error retries. Default 3000ms. */
  retryDelayMs?: number;
}

type ProbeResult = 'reachable' | 'unreachable' | 'corrupt';

function probeDatabase(database: unknown): ProbeResult {
  if (typeof database !== 'string' || database === ':memory:') {
    // In-memory databases are always reachable; an initialize failure
    // against one can only be a migration failure.
    return 'reachable';
  }
  let db: Database.Database | undefined;
  try {
    // Read-only: the probe must never create or modify the database
    // file. Short timeout so a locked database fails fast instead of
    // blocking on SQLite's busy handler.
    db = new Database(database, { readonly: true, timeout: 500 });
    db.prepare('SELECT 1').get();
    return 'reachable';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not a database|malformed|corrupt|not a valid/i.test(message)) {
      return 'corrupt';
    }
    return 'unreachable';
  } finally {
    try {
      db?.close();
    } catch {
      // Ignore close errors on a probe connection.
    }
  }
}

/**
 * Refuse to start when the database was migrated by a newer build.
 * Only runs after a successful initialize, so the migrations table
 * is guaranteed to exist (a missing table means nothing is recorded,
 * which is not a downgrade).
 */
async function assertNoUnknownMigrations(dataSource: DataSource): Promise<void> {
  const codeNames = new Set(dataSource.migrations.map((m) => m.name));
  let rows: Array<{ name: string }>;
  try {
    rows = await dataSource.query(`SELECT name FROM "migrations"`);
  } catch {
    return;
  }
  const unknown = rows.map((r) => r.name).filter((name) => !codeNames.has(name));
  if (unknown.length > 0) {
    throw new StartupError(
      `Database schema is NEWER than this build: the database records ` +
        `migration(s) this build does not know: ${unknown.join(', ')}. ` +
        `This usually means the container image was rolled back without ` +
        `restoring the database. Do NOT delete the database file. Either ` +
        `deploy the matching (newer) image, or restore the backup taken ` +
        `before the upgrade (see docs/releases.md "If an upgrade fails").`,
    );
  }
}

export async function initializeDatabase(
  dataSource: DataSource = AppDataSource,
  options: InitializeDatabaseOptions = {},
): Promise<void> {
  const maxRetries = options.maxRetries ?? 5;
  const retryDelayMs = options.retryDelayMs ?? 3000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!dataSource.isInitialized) {
        await dataSource.initialize();
      }
      await assertNoUnknownMigrations(dataSource);
      return;
    } catch (error) {
      lastError = error;
      // The downgrade guard already produced an actionable error.
      // It is never transient: never retry it.
      if (error instanceof StartupError) {
        throw error;
      }

      const probe = probeDatabase(
        (dataSource.options as { database?: unknown }).database,
      );

      if (probe === 'corrupt') {
        throw new StartupError(
          `Database file appears corrupt or is not a SQLite database. ` +
            `Startup cannot continue. Do NOT delete the database file — ` +
            `restore the backup taken before the upgrade (see ` +
            `docs/releases.md "If an upgrade fails").`,
          error,
        );
      }

      if (probe === 'reachable') {
        throw new StartupError(
          `Database migrations failed: ` +
            `${error instanceof Error ? error.message : String(error)}. ` +
            `The database was left in its pre-upgrade state (migrations ` +
            `run in a single transaction and roll back on failure) — it ` +
            `is not half-migrated. Do NOT delete the database file. ` +
            `Restore the backup taken before the upgrade (see ` +
            `docs/releases.md "If an upgrade fails").`,
          error,
        );
      }

      // Unreachable: transient connection problem, retry.
      if (attempt === maxRetries) {
        throw new StartupError(
          `Could not connect to the database after ${maxRetries} ` +
            `attempt(s). Check that the database path is writable and ` +
            `not locked by another process, then restart the container.`,
          error,
        );
      }
      console.error(
        `Failed to connect to database (attempt ${attempt}/${maxRetries}):`,
        error,
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  // Unreachable: the loop always throws. Kept for type safety.
  throw lastError;
}
