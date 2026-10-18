/**
 * System status (issue #23) — read-only admin diagnostics.
 * The backend assembles this; the frontend renders it. No field here
 * triggers any action: update checks detect, they never apply.
 */

export type UpdateCheckStatus =
  | 'up-to-date'
  | 'update-available'
  | 'unknown' // installed version could not be determined
  | 'unavailable'; // the update check itself failed (offline, GitHub unreachable, …)

export type MigrationStatus = 'up-to-date' | 'pending' | 'unknown';

export interface AvailableReleaseInfo {
  /** Outcome of the latest-release check. */
  status: UpdateCheckStatus;
  /** Latest release tag from GitHub (e.g. "v1.2.0"), null when not determined. */
  version: string | null;
  /** Raw release-notes body from GitHub, rendered as plain text on the client. */
  releaseNotes: string | null;
  /** Link to the release page on GitHub. */
  releaseUrl: string | null;
  /** When the release was published (ISO string), null when not determined. */
  publishedAt: string | null;
  /** True when the available version is newer than the installed version. */
  updateAvailable: boolean;
  /** When this check result was produced (ISO string). */
  checkedAt: string;
}

export interface SystemStatus {
  /** Installed version from the backend's own package.json, or "unknown". */
  installedVersion: string;
  /** Latest-release check (server-side cached, never throws). */
  available: AvailableReleaseInfo;
  /** Process uptime in seconds. */
  uptimeSeconds: number;
  /** SQLite database file size. sizeBytes is null when the file can't be statted. */
  database: {
    path: string;
    sizeBytes: number | null;
  };
  /** Recursive size of the uploads directory. sizeBytes is null when it can't be read. */
  uploads: {
    path: string;
    sizeBytes: number | null;
  };
  /**
   * Last backup. Backup/restore is issue #16 (not built yet), so this is
   * always "not-configured" until then — an honest empty state, not a guess.
   */
  lastBackup: {
    status: 'not-configured';
    at: string | null;
  };
  /** Applied vs. known migrations from the TypeORM migration table. */
  migrations: {
    applied: number;
    total: number;
    pending: number;
    pendingNames: string[];
    status: MigrationStatus;
  };
}
