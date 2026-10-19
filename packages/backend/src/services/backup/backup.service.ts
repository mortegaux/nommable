/**
 * Backup & restore (issue #16) — full backup export (SQLite DB + uploads)
 * with a versioned manifest, validated restore, preview, and confirmation.
 *
 * Archive format (zip):
 *   manifest.json   — versioned manifest (BackupManifest)
 *   database.db     — consistent snapshot of the SQLite database
 *   uploads/...     — the uploads tree, same relative layout as on disk
 *
 * Safety rules:
 * - Export snapshots the live DB with better-sqlite3's online `.backup()`
 *   (never a raw copy of the live file — WAL/locking would corrupt it).
 * - Restore validates BEFORE applying (manifest + schema + counts) and
 *   requires a preview + explicit confirmation step.
 * - On confirm, a safety backup of the current state is written first,
 *   then the DB + uploads are swapped and the process exits so the
 *   orchestrator (`restart: unless-stopped`) brings it back on the
 *   restored data. No in-process state survives a restore.
 * - Archive extraction defends against zip-slip (absolute paths, `..`
 *   traversal, unexpected entries), caps entry count and total
 *   uncompressed size, and never executes anything from the archive.
 * - Backup metadata (last backup / last restore) lives in a sidecar JSON
 *   file next to the DB — not inside the DB — so a restore swap cannot
 *   clobber it, and the System tab can read it after a restore.
 */
import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ZipFile as YazlZipFile } from 'yazl';
import * as yauzl from 'yauzl';
import { config } from '../../config';
import { AppDataSource } from '../../db/data-source';
import { AppError } from '../../api/middleware/error-handler';
import {
  BACKUP_FORMAT_VERSION,
  BackupManifest,
  BackupMeta,
  BackupPreview,
  EMPTY_BACKUP_META,
  EMPTY_COUNTS,
  EntityCounts,
  ServerBackupEntry,
  ServerBackupList,
} from '@nommable/shared';
import { getInstalledVersion } from '../system/system-status.service';

export const MANIFEST_ENTRY = 'manifest.json';
export const DB_ENTRY = 'database.db';
export const UPLOADS_PREFIX = 'uploads/';
export const BACKUP_META_FILENAME = 'backup-meta.json';
export const SAFETY_BACKUP_DIRNAME = 'backups';
export const MAX_RESTORE_ARCHIVE_BYTES = 1024 * 1024 * 1024; // 1 GiB upload cap
export const MAX_ARCHIVE_ENTRIES = 50_000;
export const MAX_UNCOMPRESSED_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB zip-bomb cap
export const PREVIEW_TTL_MS = 30 * 60 * 1000; // staged archives expire after 30 min

/** Tables counted for manifest/preview, mapped to EntityCounts keys. */
const COUNT_TABLES: Array<{ table: string; key: keyof EntityCounts }> = [
  { table: 'recipes', key: 'recipes' },
  { table: 'stored_images', key: 'images' },
  { table: 'users', key: 'users' },
  { table: 'meal_plans', key: 'mealPlans' },
  { table: 'shopping_lists', key: 'shoppingLists' },
  { table: 'pantry_items', key: 'pantryItems' },
  { table: 'batch_cooking_plans', key: 'batchPlans' },
];

/** Tables the restore validator requires to exist in a backup database. */
const REQUIRED_TABLES = COUNT_TABLES.map((c) => c.table);

/** Tables that must exist for the app to boot (TypeORM entities + raw tables). */
const BOOT_TABLES = [...REQUIRED_TABLES, 'migrations'];

/** Staged restore records, keyed by preview token. */
interface StagedRestore {
  archivePath: string;
  manifest: BackupManifest;
  counts: EntityCounts;
  createdAt: number;
}

const stagedRestores = new Map<string, StagedRestore>();

/** Test hook: forget all staged restores. */
export function clearStagedRestores(): void {
  for (const staged of stagedRestores.values()) {
    try {
      fs.unlinkSync(staged.archivePath);
    } catch {
      // Already gone.
    }
  }
  stagedRestores.clear();
}

/** Directory holding the live DB file (defaults to the OS temp dir for :memory:). */
export /**
 * Error message that works across JS realms (jest's VM context has its own
 * Error class, so `instanceof Error` can be false for genuine Errors).
 */
function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/**
 * Move a file or directory, falling back to copy + delete when source and
 * destination are on different filesystems (EXDEV). The staging dir lives
 * in os.tmpdir(), which is a different filesystem from /data in Docker —
 * a bare rename would fail every production restore.
 */
function movePath(src: string, dest: string): void {
  try {
    fs.renameSync(src, dest);
  } catch (err: unknown) {
    const code = (err as { code?: unknown })?.code;
    if (code !== 'EXDEV') throw err;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
      fs.rmSync(src, { recursive: true, force: true });
    } else {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    }
  }
}

export function getDataDir(): string {
  if (config.database.path === ':memory:') return os.tmpdir();
  return path.dirname(path.resolve(config.database.path));
}

export function getMetaPath(): string {
  return path.join(getDataDir(), BACKUP_META_FILENAME);
}

/** Directory holding server-side backups (safety backups from restores). */
export function getBackupsDir(): string {
  return path.join(getDataDir(), SAFETY_BACKUP_DIRNAME);
}

/** Cap on list responses so a huge backups dir can't produce a huge payload. */
export const MAX_LISTED_BACKUPS = 500;

/**
 * List the on-disk server backups (issue #74). Never throws for a bad
 * directory or a bad entry: a missing dir is an empty list, and an
 * unreadable entry is listed with `status: 'unreadable'` + a reason, so
 * one corrupt file can never break the whole list (or the page).
 *
 * Classification is by file name only: the server writes safety backups
 * as `safety-<timestamp>.zip` (see confirmRestore); anything else ending
 * in `.zip` is an export archive placed on the server.
 */
export function listServerBackups(
  backupsDir: string = getBackupsDir()
): ServerBackupList {
  let names: string[];
  try {
    names = fs.readdirSync(backupsDir);
  } catch {
    return { backups: [] };
  }
  const entries: ServerBackupEntry[] = [];
  for (const name of names) {
    const full = path.join(backupsDir, name);
    const kind: ServerBackupEntry['kind'] = name.startsWith('safety-')
      ? 'safety'
      : 'export';
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      entries.push({
        name,
        sizeBytes: 0,
        createdAt: new Date(0).toISOString(),
        kind,
        status: 'unreadable',
        error: 'Could not read file',
      });
      continue;
    }
    if (!stat.isFile()) {
      entries.push({
        name,
        sizeBytes: 0,
        createdAt: stat.mtime.toISOString(),
        kind,
        status: 'unreadable',
        error: 'Not a file',
      });
      continue;
    }
    if (!name.toLowerCase().endsWith('.zip')) {
      entries.push({
        name,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
        kind,
        status: 'unreadable',
        error: 'Not a .zip archive',
      });
      continue;
    }
    if (stat.size === 0) {
      entries.push({
        name,
        sizeBytes: 0,
        createdAt: stat.mtime.toISOString(),
        kind,
        status: 'unreadable',
        error: 'File is empty',
      });
      continue;
    }
    entries.push({
      name,
      sizeBytes: stat.size,
      createdAt: stat.mtime.toISOString(),
      kind,
      status: 'ok',
    });
  }
  // Newest first; name breaks mtime ties so the order is deterministic.
  entries.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name)
  );
  return { backups: entries.slice(0, MAX_LISTED_BACKUPS) };
}

/**
 * Resolve a client-supplied backup name to its on-disk path. The name must
 * be a plain basename ending in `.zip` — anything else (traversal, absolute
 * paths, separators, wrong extension) is rejected, and the resolved path
 * must stay inside the backups dir.
 */
export function resolveServerBackupPath(
  name: string,
  backupsDir: string = getBackupsDir()
): string {
  if (
    typeof name !== 'string' ||
    !name ||
    name !== path.basename(name) ||
    name.includes('/') ||
    name.includes('\\') ||
    name === '.' ||
    name === '..' ||
    !name.toLowerCase().endsWith('.zip')
  ) {
    throw new AppError(400, 'Invalid backup name');
  }
  const dir = path.resolve(backupsDir);
  const resolved = path.resolve(dir, name);
  if (resolved !== dir && !resolved.startsWith(dir + path.sep)) {
    throw new AppError(400, 'Invalid backup name');
  }
  return resolved;
}

/**
 * Preview a restore from a server-side backup (issue #74). Copies the
 * server file to a temp staging path first, so confirm's cleanup deletes
 * only the copy — never the server backup itself.
 */
export async function previewServerBackup(
  name: string,
  backupsDir: string = getBackupsDir()
): Promise<BackupPreview> {
  const src = resolveServerBackupPath(name, backupsDir);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(src);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    throw new AppError(404, 'Backup not found');
  }
  const stagingPath = path.join(
    os.tmpdir(),
    `nommable-preview-${crypto.randomBytes(8).toString('hex')}.zip`
  );
  try {
    fs.copyFileSync(src, stagingPath);
  } catch {
    throw new AppError(500, 'Could not stage backup for preview');
  }
  try {
    return await previewRestore(stagingPath, stat.size);
  } catch (err) {
    // previewRestore throws for invalid archives; remove the orphaned copy.
    try {
      fs.unlinkSync(stagingPath);
    } catch {
      // Already gone.
    }
    throw err;
  }
}

/** Read the backup sidecar file; returns empty meta when missing/corrupt. */
export function readBackupMeta(): BackupMeta {
  try {
    const raw = fs.readFileSync(getMetaPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<BackupMeta>;
    return {
      lastBackupAt: typeof parsed.lastBackupAt === 'string' ? parsed.lastBackupAt : null,
      lastBackupCounts:
        parsed.lastBackupCounts && typeof parsed.lastBackupCounts === 'object'
          ? { ...EMPTY_COUNTS, ...parsed.lastBackupCounts }
          : null,
      lastRestoreAt: typeof parsed.lastRestoreAt === 'string' ? parsed.lastRestoreAt : null,
      restoredFrom: typeof parsed.restoredFrom === 'string' ? parsed.restoredFrom : null,
    };
  } catch {
    return { ...EMPTY_BACKUP_META };
  }
}

/** Atomic sidecar write (tmp file + rename) so a crash can't half-write it. */
export function writeBackupMeta(patch: Partial<BackupMeta>): BackupMeta {
  const meta = { ...readBackupMeta(), ...patch };
  const tmpPath = `${getMetaPath()}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(meta, null, 2), 'utf8');
  fs.renameSync(tmpPath, getMetaPath());
  return meta;
}

/** Count rows for one table; a missing table counts as 0 (fresh DBs). */
async function countTable(
  query: (sql: string) => Promise<Array<{ c: number }>>,
  table: string
): Promise<number> {
  try {
    const rows = await query(`SELECT COUNT(*) AS c FROM "${table}"`);
    const value = rows?.[0]?.c;
    return typeof value === 'number' ? value : 0;
  } catch {
    return 0;
  }
}

/** Entity counts from a query function (live TypeORM or a better-sqlite3 handle). */
async function getCounts(
  query: (sql: string) => Promise<Array<{ c: number }>>
): Promise<EntityCounts> {
  const counts: EntityCounts = { ...EMPTY_COUNTS };
  for (const { table, key } of COUNT_TABLES) {
    counts[key] = await countTable(query, table);
  }
  return counts;
}

/** Applied migration names from a database (live or backup). */
async function getAppliedMigrations(
  query: (sql: string) => Promise<Array<{ name: string }>>
): Promise<string[]> {
  try {
    const rows = await query('SELECT name FROM migrations');
    return rows.map((r) => r.name).filter((n): n is string => typeof n === 'string');
  } catch {
    return [];
  }
}

/** Migration names the running code knows about (TypeORM registered migrations). */
function getKnownMigrations(): string[] {
  return AppDataSource.migrations
    .map((m) => m.name)
    .filter((name): name is string => typeof name === 'string');
}

/** Recursive file walk, skipping symlinks. Returns paths relative to `root`. */
function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(path.relative(root, full));
    }
  }
  return out;
}

/**
 * Consistent snapshot of the live database via better-sqlite3's online
 * backup (safe on a live DB, WAL-aware). Never a raw file copy.
 */
async function snapshotDatabase(destPath: string): Promise<void> {
  if (config.database.path === ':memory:') {
    throw new AppError(400, 'Cannot back up an in-memory database');
  }
  const src = new Database(config.database.path, { readonly: true });
  try {
    await src.backup(destPath);
  } finally {
    src.close();
  }
}

/** Counts + applied migrations read from a snapshot/backup DB file (read-only). */
async function readSnapshotInfo(dbPath: string): Promise<{
  counts: EntityCounts;
  migrations: string[];
  tables: string[];
}> {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const query = async (sql: string) => db.prepare(sql).all() as Array<{ c: number }>;
    const counts = await getCounts(query);
    const migrations = await getAppliedMigrations(
      query as unknown as (sql: string) => Promise<Array<{ name: string }>>
    );
    const tables = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
    ).all() as Array<{ name: string }>).map((r) => r.name);
    return { counts, migrations, tables };
  } finally {
    db.close();
  }
}

function countsEqual(a: EntityCounts, b: EntityCounts): boolean {
  return (Object.keys(a) as Array<keyof EntityCounts>).every((k) => a[k] === b[k]);
}

/**
 * Create a full backup archive (zip) in a fresh temp dir.
 * Returns the archive path, the manifest, and the temp dir (caller deletes it).
 */
export async function createBackupArchive(): Promise<{
  archivePath: string;
  manifest: BackupManifest;
  tmpDir: string;
}> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nommable-backup-'));
  try {
    const snapshotPath = path.join(tmpDir, DB_ENTRY);
    await snapshotDatabase(snapshotPath);
    const { counts, migrations } = await readSnapshotInfo(snapshotPath);

    const uploadFiles = fs.existsSync(config.upload.dir)
      ? walkFiles(config.upload.dir)
      : [];

    const createdAt = new Date().toISOString();
    const manifest: BackupManifest = {
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: getInstalledVersion(),
      createdAt,
      schemaVersion: migrations,
      counts,
      dbFile: DB_ENTRY,
      uploadsPrefix: UPLOADS_PREFIX,
      uploadFileCount: uploadFiles.length,
    };

    const archivePath = path.join(tmpDir, 'backup.zip');
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(archivePath);
      const zip = new YazlZipFile();
      zip.outputStream
        .pipe(output)
        .on('close', () => resolve())
        .on('error', reject);
      zip.outputStream.on('error', reject);
      zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), MANIFEST_ENTRY);
      zip.addFile(snapshotPath, DB_ENTRY);
      for (const rel of uploadFiles) {
        zip.addFile(
          path.join(config.upload.dir, rel),
          `${UPLOADS_PREFIX}${rel.split(path.sep).join('/')}`
        );
      }
      zip.end();
    });

    // Record the export in the sidecar (survives future restores).
    writeBackupMeta({ lastBackupAt: createdAt, lastBackupCounts: counts });
    return { archivePath, manifest, tmpDir };
  } catch (err) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best effort.
    }
    throw err;
  }
}

/** Zip magic: local file header (PK\x03\x04) or empty archive (PK\x05\x06). */
export function hasZipMagic(filePath: string): boolean {
  try {
    const head = fs.readFileSync(filePath).subarray(0, 4);
    if (head.length < 4) return false;
    return (
      (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) ||
      (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x05 && head[3] === 0x06)
    );
  } catch {
    return false;
  }
}

/**
 * Zip-slip guard: an entry is safe only when it is exactly the manifest or
 * the DB file, or lives under uploads/ — with no absolute path, no `..`
 * segment, and no backslash (Windows-style traversal).
 */
export function isSafeArchiveEntry(entryPath: string): boolean {
  if (!entryPath || entryPath.includes('\\')) return false;
  if (path.posix.isAbsolute(entryPath)) return false;
  const segments = entryPath.split('/');
  if (segments.some((s) => s === '..' || s === '')) return false;
  if (entryPath === MANIFEST_ENTRY || entryPath === DB_ENTRY) return true;
  if (entryPath.startsWith(UPLOADS_PREFIX) && segments.length > 1) return true;
  return false;
}

function isValidManifest(value: unknown): value is BackupManifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  if (m.formatVersion !== BACKUP_FORMAT_VERSION) return false;
  if (typeof m.appVersion !== 'string' || !m.appVersion) return false;
  if (typeof m.createdAt !== 'string' || Number.isNaN(Date.parse(m.createdAt))) return false;
  if (!Array.isArray(m.schemaVersion) || !m.schemaVersion.every((s) => typeof s === 'string'))
    return false;
  if (!m.counts || typeof m.counts !== 'object') return false;
  const counts = m.counts as Record<string, unknown>;
  if (
    (Object.keys(EMPTY_COUNTS) as Array<keyof EntityCounts>).some(
      (k) => typeof counts[k] !== 'number' || !Number.isInteger(counts[k]) || (counts[k] as number) < 0
    )
  )
    return false;
  if (m.dbFile !== DB_ENTRY) return false;
  if (m.uploadsPrefix !== UPLOADS_PREFIX) return false;
  if (typeof m.uploadFileCount !== 'number' || !Number.isInteger(m.uploadFileCount) || m.uploadFileCount < 0)
    return false;
  return true;
}

interface ValidatedArchive {
  manifest: BackupManifest;
  counts: EntityCounts;
  errors: string[];
  warnings: string[];
  /** Extracted DB file (temp path, caller deletes). Only set when valid. */
  stagedDbPath: string | null;
}

/**
 * Validate a restore archive: entry rules, manifest shape, schema
 * compatibility, and manifest-vs-database count agreement. Extracts only
 * the manifest + DB to a temp dir; uploads are extracted at confirm time.
 * Never throws for a bad archive — returns errors instead.
 */
export async function validateArchive(archivePath: string): Promise<ValidatedArchive> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const invalid = (errs: string[]): ValidatedArchive => ({
    manifest: null as unknown as BackupManifest,
    counts: { ...EMPTY_COUNTS },
    errors: errs,
    warnings,
    stagedDbPath: null,
  });

  if (!fs.existsSync(archivePath)) {
    return invalid(['Archive file not found']);
  }
  if (fs.statSync(archivePath).size === 0) {
    return invalid(['Archive is empty']);
  }
  if (!hasZipMagic(archivePath)) {
    return invalid(['File is not a zip archive']);
  }

  // Single-pass entry walk: yauzl closes the file once the 'end' event
  // fires, so entries must be consumed as they arrive, not listed first.
  let zipfile: yauzl.ZipFile;
  try {
    zipfile = await yauzl.openPromise(archivePath, { lazyEntries: true });
  } catch {
    return invalid(['Could not read zip archive (corrupt?)']);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nommable-validate-'));
  const stagedDbPath = path.join(tmpDir, DB_ENTRY);
  const seen = new Set<string>();
  let totalUncompressed = 0;
  let entryCount = 0;
  let overEntryCap = false;
  let manifestRaw: Buffer | null = null;
  let dbExtracted = false;

  try {
    await new Promise<void>((resolve, reject) => {
      const onEntry = async (entry: yauzl.Entry) => {
        try {
          entryCount++;
          if (entryCount > MAX_ARCHIVE_ENTRIES) {
            if (!overEntryCap) {
              overEntryCap = true;
              errors.push(
                `Archive has too many entries (>${MAX_ARCHIVE_ENTRIES})`
              );
            }
            zipfile.readEntry();
            return;
          }
          if (!isSafeArchiveEntry(entry.fileName)) {
            errors.push(`Unsafe archive entry rejected: ${entry.fileName}`);
            zipfile.readEntry();
            return;
          }
          if (seen.has(entry.fileName)) {
            errors.push(`Duplicate archive entry: ${entry.fileName}`);
            zipfile.readEntry();
            return;
          }
          seen.add(entry.fileName);
          totalUncompressed += entry.uncompressedSize;
          if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
            errors.push('Archive uncompressed size exceeds the 5 GiB cap');
            zipfile.readEntry();
            return;
          }
          if (entry.fileName === MANIFEST_ENTRY) {
            const stream = await zipfile.openReadStreamPromise(entry);
            const chunks: Buffer[] = [];
            await new Promise<void>((res2, rej2) => {
              stream.on('data', (chunk: Buffer) => chunks.push(chunk));
              stream.on('end', () => res2());
              stream.on('error', rej2);
            });
            manifestRaw = Buffer.concat(chunks);
          } else if (entry.fileName === DB_ENTRY) {
            const stream = await zipfile.openReadStreamPromise(entry);
            await new Promise<void>((res2, rej2) => {
              const out = fs.createWriteStream(stagedDbPath);
              stream.on('error', rej2).pipe(out).on('finish', () => res2()).on('error', rej2);
            });
            dbExtracted = true;
          }
          // Uploads entries are validated by name here; their bytes are
          // extracted at confirm time, not during validation.
          zipfile.readEntry();
        } catch (err) {
          reject(err);
        }
      };
      zipfile.on('entry', onEntry);
      zipfile.on('end', () => resolve());
      zipfile.on('error', reject);
      zipfile.readEntry();
    });
  } catch {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return invalid([...errors, 'Could not read zip archive (corrupt?)']);
  } finally {
    try {
      zipfile.close();
    } catch {
      // Already closed on 'end'.
    }
  }

  if (errors.length > 0) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return invalid(errors);
  }
  if (manifestRaw === null) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return invalid(['Archive is missing manifest.json']);
  }
  if (!dbExtracted) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return invalid(['Archive is missing database.db']);
  }

  let manifest: BackupManifest;
  try {
    manifest = JSON.parse((manifestRaw as Buffer).toString('utf8')) as BackupManifest;
  } catch {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return invalid(['manifest.json is not valid JSON']);
  }
  if (!isValidManifest(manifest)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return invalid(['manifest.json failed validation (bad format version, shape, or counts)']);
  }

  let info: { counts: EntityCounts; migrations: string[]; tables: string[] };
  try {
    info = await readSnapshotInfo(stagedDbPath);
  } catch {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { manifest, counts: { ...EMPTY_COUNTS }, errors: ['database.db is not a readable SQLite database'], warnings, stagedDbPath: null };
  }

  for (const table of BOOT_TABLES) {
    if (!info.tables.includes(table)) {
      errors.push(`Backup database is missing required table: ${table}`);
    }
  }
  const known = new Set(getKnownMigrations());
  const unknown = info.migrations.filter((m) => !known.has(m));
  if (unknown.length > 0) {
    errors.push(
      `Backup is from a newer version (unknown migrations: ${unknown.join(', ')}) — restore it on a newer app version`
    );
  }
  if (!countsEqual(info.counts, manifest.counts)) {
    errors.push('Manifest counts do not match the backup database (archive may be corrupt or tampered)');
  }
  if (errors.length > 0) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { manifest, counts: info.counts, errors, warnings, stagedDbPath: null };
  }

  return { manifest, counts: info.counts, errors, warnings, stagedDbPath };
}

/** Remove staged restores whose preview expired. */
function pruneStagedRestores(now = Date.now()): void {
  for (const [token, staged] of stagedRestores) {
    if (now - staged.createdAt > PREVIEW_TTL_MS) {
      try {
        fs.unlinkSync(staged.archivePath);
      } catch {
        // Already gone.
      }
      stagedRestores.delete(token);
    }
  }
}

/**
 * Preview a restore: validate the uploaded archive and stage it under a
 * token. Nothing is applied — the live database and uploads are untouched.
 */
export async function previewRestore(
  archivePath: string,
  archiveSizeBytes: number
): Promise<BackupPreview> {
  pruneStagedRestores();
  const validated = await validateArchive(archivePath);
  // The validation temp dir (with the staged DB) is no longer needed:
  // confirm re-validates from the staged archive file.
  if (validated.stagedDbPath) {
    try {
      fs.rmSync(path.dirname(validated.stagedDbPath), { recursive: true, force: true });
    } catch {
      // Best effort.
    }
  }
  if (validated.errors.length > 0) {
    throw new AppError(
      400,
      `Backup validation failed: ${validated.errors.join('; ')}`
    );
  }
  const token = crypto.randomBytes(32).toString('hex');
  stagedRestores.set(token, {
    archivePath,
    manifest: validated.manifest,
    counts: validated.counts,
    createdAt: Date.now(),
  });
  return {
    token,
    manifest: validated.manifest,
    counts: validated.counts,
    validation: { valid: true, errors: [], warnings: validated.warnings },
    archiveSizeBytes,
    expiresAt: new Date(Date.now() + PREVIEW_TTL_MS).toISOString(),
  };
}

/**
 * Extract every entry of a validated archive into `destDir`.
 * The archive must already have passed validateArchive; entry rules are
 * re-checked here so a swapped file can't smuggle a traversal in.
 */
async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  const zipfile = await yauzl.openPromise(archivePath, { lazyEntries: true });
  let totalBytes = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const onEntry = async (entry: yauzl.Entry) => {
        try {
          if (!isSafeArchiveEntry(entry.fileName)) {
            throw new AppError(400, `Unsafe archive entry rejected: ${entry.fileName}`);
          }
          const dest = path.join(destDir, entry.fileName);
          // Belt-and-braces: the resolved path must stay inside destDir.
          if (!dest.startsWith(path.resolve(destDir) + path.sep) && dest !== path.resolve(destDir)) {
            throw new AppError(400, `Unsafe archive entry rejected: ${entry.fileName}`);
          }
          if (entry.fileName.endsWith('/')) {
            fs.mkdirSync(dest, { recursive: true });
          } else {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            const stream = await zipfile.openReadStreamPromise(entry);
            await new Promise<void>((res2, rej2) => {
              const out = fs.createWriteStream(dest);
              stream
                .on('data', (chunk: Buffer) => {
                  totalBytes += chunk.length;
                  if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
                    out.destroy(new Error('Archive uncompressed size exceeds the 5 GiB cap'));
                  }
                })
                .on('error', rej2)
                .pipe(out)
                .on('finish', () => res2())
                .on('error', rej2);
            });
          }
          zipfile.readEntry();
        } catch (err) {
          reject(err);
        }
      };
      zipfile.on('entry', onEntry);
      zipfile.on('end', () => resolve());
      zipfile.on('error', reject);
      zipfile.readEntry();
    });
  } finally {
    try {
      zipfile.close();
    } catch {
      // Already closed on 'end'.
    }
  }
}

/**
 * Apply a previewed restore: safety-backup current state, swap DB +
 * uploads, record the restore, and exit so the orchestrator restarts the
 * process on the restored data. Requires a live preview token — there is
 * no path to restore without preview + explicit confirmation.
 */
export async function confirmRestore(
  token: string,
  opts?: { exitProcess?: () => void }
): Promise<void> {
  pruneStagedRestores();
  const staged = stagedRestores.get(token);
  if (!staged) {
    throw new AppError(
      400,
      'Restore token is unknown or expired — upload the backup and preview it again'
    );
  }
  stagedRestores.delete(token);

  // Re-validate from the staged archive file (it may have changed since preview).
  const validated = await validateArchive(staged.archivePath);
  if (validated.stagedDbPath) {
    try {
      fs.rmSync(path.dirname(validated.stagedDbPath), { recursive: true, force: true });
    } catch {
      // Best effort.
    }
  }
  if (validated.errors.length > 0) {
    throw new AppError(400, `Backup validation failed: ${validated.errors.join('; ')}`);
  }

  const dataDir = getDataDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // 1. Safety backup of the CURRENT state — abort the restore if this fails.
  try {
    const safety = await createBackupArchive();
    const safetyDir = path.join(dataDir, SAFETY_BACKUP_DIRNAME);
    fs.mkdirSync(safetyDir, { recursive: true });
    const safetyPath = path.join(safetyDir, `safety-${timestamp}.zip`);
    fs.copyFileSync(safety.archivePath, safetyPath);
    fs.rmSync(safety.tmpDir, { recursive: true, force: true });
  } catch (err) {
    throw new AppError(
      500,
      `Restore aborted: could not write a safety backup of the current data (${errorMessage(err)})`
    );
  }

  // 2. Extract the restore archive to a staging dir.
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nommable-restore-'));
  try {
    await extractArchive(staged.archivePath, extractDir);
  } catch (err) {
    fs.rmSync(extractDir, { recursive: true, force: true });
    throw new AppError(400, `Restore aborted during extraction: ${errorMessage(err)}`);
  }
  const stagedDb = path.join(extractDir, DB_ENTRY);
  const stagedUploads = path.join(extractDir, 'uploads');
  if (!fs.existsSync(stagedDb)) {
    fs.rmSync(extractDir, { recursive: true, force: true });
    throw new AppError(400, 'Restore aborted: extracted archive has no database.db');
  }

  // 3. Close the live database so the file can be swapped.
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }

  const liveDb = path.resolve(config.database.path);
  const liveUploads = path.resolve(config.upload.dir);

  // 4. Swap the database file (keep a raw pre-restore copy as belt-and-braces).
  try {
    if (fs.existsSync(liveDb)) {
      fs.renameSync(liveDb, `${liveDb}.pre-restore-${timestamp}`);
    }
    for (const suffix of ['-wal', '-shm']) {
      try {
        fs.unlinkSync(`${liveDb}${suffix}`);
      } catch {
        // No WAL sidecar — fine.
      }
    }
    movePath(stagedDb, liveDb);
  } catch (err) {
    throw new AppError(500, `Restore failed while swapping the database: ${errorMessage(err)}`);
  }

  // 5. Swap the uploads tree.
  try {
    if (fs.existsSync(liveUploads)) {
      fs.renameSync(liveUploads, `${liveUploads}.bak-${timestamp}`);
    }
    if (fs.existsSync(stagedUploads)) {
      movePath(stagedUploads, liveUploads);
    } else {
      fs.mkdirSync(liveUploads, { recursive: true });
    }
    try {
      fs.rmSync(`${liveUploads}.bak-${timestamp}`, { recursive: true, force: true });
    } catch {
      // Stale uploads backup is cleaned up on next startup; not fatal.
    }
  } catch (err) {
    throw new AppError(500, `Restore failed while swapping uploads: ${errorMessage(err)}`);
  }

  // 6. Record the restore in the sidecar (survives the swap — it is not in the DB).
  writeBackupMeta({
    lastRestoreAt: new Date().toISOString(),
    restoredFrom: validated.manifest.createdAt,
  });

  // 7. Clean up staging, then exit so the orchestrator restarts on restored data.
  try {
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.unlinkSync(staged.archivePath);
  } catch {
    // Best effort.
  }
  const exitProcess = opts?.exitProcess ?? (() => process.exit(0));
  setTimeout(() => exitProcess(), 250);
}
