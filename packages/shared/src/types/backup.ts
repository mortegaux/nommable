/**
 * Backup & restore (issue #16) — full backup export (SQLite DB + uploads)
 * with a versioned manifest, validated restore, preview, and confirmation.
 *
 * The archive format is a zip containing exactly:
 *   manifest.json   — versioned manifest (see BackupManifest)
 *   database.db     — consistent snapshot of the SQLite database
 *   uploads/...     — the uploads tree, same relative layout as on disk
 */

/** Counts for the entity categories a backup covers (issue #16 acceptance). */
export interface EntityCounts {
  /** Rows in `recipes`. */
  recipes: number;
  /** Rows in `stored_images` (image blobs mirrored from the uploads tree). */
  images: number;
  /** Rows in `users` (the app User entity). */
  users: number;
  /** Rows in `meal_plans`. */
  mealPlans: number;
  /** Rows in `shopping_lists`. */
  shoppingLists: number;
  /** Rows in `pantry_items`. */
  pantryItems: number;
  /** Rows in `batch_cooking_plans`. */
  batchPlans: number;
}

export const EMPTY_COUNTS: EntityCounts = {
  recipes: 0,
  images: 0,
  users: 0,
  mealPlans: 0,
  shoppingLists: 0,
  pantryItems: 0,
  batchPlans: 0,
};

/** Current backup archive format version. Bump when the layout changes. */
export const BACKUP_FORMAT_VERSION = 1;

/** Versioned manifest written into every backup archive. */
export interface BackupManifest {
  /** Archive format version (BACKUP_FORMAT_VERSION). */
  formatVersion: number;
  /** App version that produced the backup (from the backend's package.json). */
  appVersion: string;
  /** When the backup was created (ISO string). */
  createdAt: string;
  /** Applied migration names at export time — used for schema compatibility. */
  schemaVersion: string[];
  /** Entity counts in the snapshotted database. */
  counts: EntityCounts;
  /** Name of the database entry inside the archive. */
  dbFile: string;
  /** Prefix for upload entries inside the archive. */
  uploadsPrefix: string;
  /** Number of upload files in the archive. */
  uploadFileCount: number;
}

/** Result of validating a restore archive (manifest + schema + counts). */
export interface BackupValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Restore preview — returned after uploading an archive, before anything
 * is applied. The client must send the token back with confirmed: true
 * to apply the restore.
 */
export interface BackupPreview {
  /** Opaque token binding the preview to the staged archive. */
  token: string;
  manifest: BackupManifest;
  /** Actual counts read from the backup database (must match the manifest). */
  counts: EntityCounts;
  validation: BackupValidation;
  /** Size of the uploaded archive in bytes. */
  archiveSizeBytes: number;
  /** When the preview (and staged archive) expires (ISO string). */
  expiresAt: string;
}

/** Durable instance metadata about backups/restores (sidecar file, not in the DB). */
export interface BackupMeta {
  /** When the most recent backup export was created (ISO string), null if none. */
  lastBackupAt: string | null;
  /** Entity counts of the most recent backup export, null if none. */
  lastBackupCounts: EntityCounts | null;
  /** When the most recent restore was applied (ISO string), null if none. */
  lastRestoreAt: string | null;
  /** createdAt of the backup that was restored, null if none. */
  restoredFrom: string | null;
}

export const EMPTY_BACKUP_META: BackupMeta = {
  lastBackupAt: null,
  lastBackupCounts: null,
  lastRestoreAt: null,
  restoredFrom: null,
};

/**
 * One on-disk server backup (issue #74) — a safety backup written before a
 * restore, or an export archive placed on the server. `name` is a basename
 * only; absolute paths are never exposed.
 */
export interface ServerBackupEntry {
  /** File name (basename only, e.g. `safety-2026-10-18T12-00-00-000Z.zip`). */
  name: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** File mtime (ISO string). */
  createdAt: string;
  /** `safety` = written by the server before a restore; `export` = anything else. */
  kind: 'safety' | 'export';
  /** `ok` = listable file; `unreadable` = shown with a reason, no actions. */
  status: 'ok' | 'unreadable';
  /** Reason when `status` is `unreadable`. */
  error?: string;
}

/** Response for `GET /api/settings/backup/list`. */
export interface ServerBackupList {
  backups: ServerBackupEntry[];
}
