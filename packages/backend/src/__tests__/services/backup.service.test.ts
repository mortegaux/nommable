/**
 * Unit tests for the backup service (issue #16): archive validation,
 * zip-slip guards, manifest/schema checks, sidecar metadata.
 * The full swap path lives in backup-restore-roundtrip.test.ts.
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ZipFile as YazlZipFile } from 'yazl';
import { AppDataSource } from '../../db/data-source';
import { config } from '../../config';
import {
  BACKUP_META_FILENAME,
  clearStagedRestores,
  createBackupArchive,
  getDataDir,
  hasZipMagic,
  isSafeArchiveEntry,
  previewRestore,
  readBackupMeta,
  validateArchive,
} from '../../services/backup/backup.service';
import { BACKUP_FORMAT_VERSION, BackupManifest, EMPTY_COUNTS } from '@nommable/shared';

function makeManifest(overrides: Partial<BackupManifest> = {}): BackupManifest {
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: '1.1.0',
    createdAt: new Date().toISOString(),
    schemaVersion: ['InitialSchema1788000000000'],
    counts: { ...EMPTY_COUNTS },
    dbFile: 'database.db',
    uploadsPrefix: 'uploads/',
    uploadFileCount: 0,
    ...overrides,
  };
}

/** Build a zip from entries: { [name]: string | Buffer }. */
async function buildZip(entries: Record<string, string | Buffer>): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nommable-zip-test-'));
  const zipPath = path.join(tmpDir, 'test.zip');
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const zip = new YazlZipFile();
    zip.outputStream.pipe(output).on('close', () => resolve()).on('error', reject);
    zip.outputStream.on('error', reject);
    for (const [name, content] of Object.entries(entries)) {
      zip.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name);
    }
    zip.end();
  });
  return zipPath;
}

/**
 * Build a zip with raw stored (method 0) entries, bypassing yazl's path
 * validation — needed to craft a zip-slip fixture with a `../` entry.
 * Uses Node's built-in crc32 (Node 22+).
 */
async function buildZipRaw(entries: Record<string, string | Buffer>): Promise<string> {
  const { crc32 } = await import('node:zlib');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nommable-zip-test-'));
  const zipPath = path.join(tmpDir, 'test.zip');
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // method: stored
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42); // local header offset
    centralParts.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8); // entries this disk
  eocd.writeUInt16LE(Object.keys(entries).length, 10); // total entries
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  fs.writeFileSync(zipPath, Buffer.concat([...localParts, centralDir, eocd]));
  return zipPath;
}

/** A minimal valid SQLite DB file with the tables the validator requires. */
function makeDbFile(extraSql = ''): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nommable-db-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE migrations (name varchar PRIMARY KEY);
    INSERT INTO migrations (name) VALUES ('InitialSchema1788000000000');
    CREATE TABLE recipes (id varchar PRIMARY KEY);
    CREATE TABLE stored_images (file_path varchar PRIMARY KEY);
    CREATE TABLE users (id varchar PRIMARY KEY);
    CREATE TABLE meal_plans (id varchar PRIMARY KEY);
    CREATE TABLE shopping_lists (id varchar PRIMARY KEY);
    CREATE TABLE pantry_items (id varchar PRIMARY KEY);
    CREATE TABLE batch_cooking_plans (id varchar PRIMARY KEY);
    ${extraSql}
  `);
  db.close();
  return dbPath;
}

describe('isSafeArchiveEntry', () => {
  it('accepts the manifest, the DB file, and uploads/* paths', () => {
    expect(isSafeArchiveEntry('manifest.json')).toBe(true);
    expect(isSafeArchiveEntry('database.db')).toBe(true);
    expect(isSafeArchiveEntry('uploads/recipes/photo.jpg')).toBe(true);
    expect(isSafeArchiveEntry('uploads/a/b/c.png')).toBe(true);
  });

  it('rejects absolute paths, traversal, backslashes, and unexpected entries', () => {
    expect(isSafeArchiveEntry('/etc/passwd')).toBe(false);
    expect(isSafeArchiveEntry('../evil')).toBe(false);
    expect(isSafeArchiveEntry('uploads/../../evil')).toBe(false);
    expect(isSafeArchiveEntry('uploads\\..\\evil')).toBe(false);
    expect(isSafeArchiveEntry('evil.sh')).toBe(false);
    expect(isSafeArchiveEntry('uploads/')).toBe(false);
    expect(isSafeArchiveEntry('')).toBe(false);
    expect(isSafeArchiveEntry('database.db/extra')).toBe(false);
  });
});

describe('hasZipMagic', () => {
  it('accepts real zips and rejects plain text', async () => {
    const zipPath = await buildZip({ 'a.txt': 'hello' });
    expect(hasZipMagic(zipPath)).toBe(true);
    const txtPath = path.join(os.tmpdir(), `nommable-notzip-${Date.now()}.txt`);
    fs.writeFileSync(txtPath, 'not a zip');
    expect(hasZipMagic(txtPath)).toBe(false);
  });
});

describe('validateArchive', () => {
  afterEach(() => {
    clearStagedRestores();
  });

  it('rejects a non-zip file', async () => {
    const txtPath = path.join(os.tmpdir(), `nommable-notzip-${Date.now()}.txt`);
    fs.writeFileSync(txtPath, 'not a zip');
    const result = await validateArchive(txtPath);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.stagedDbPath).toBeNull();
  });

  it('rejects a corrupt manifest', async () => {
    const zipPath = await buildZip({
      'manifest.json': '{not json',
      'database.db': fs.readFileSync(makeDbFile()),
    });
    const result = await validateArchive(zipPath);
    expect(result.errors.join(' ')).toMatch(/manifest/i);
  });

  it('rejects an unsupported format version', async () => {
    const zipPath = await buildZip({
      'manifest.json': JSON.stringify(makeManifest({ formatVersion: 99 })),
      'database.db': fs.readFileSync(makeDbFile()),
    });
    const result = await validateArchive(zipPath);
    expect(result.errors.join(' ')).toMatch(/manifest/i);
  });

  it('rejects a zip-slip entry', async () => {
    // yauzl itself rejects `..` names at read time (first layer); the
    // allowlist in validateArchive is the second layer. Either way the
    // archive must not validate.
    const zipPath = await buildZipRaw({
      'manifest.json': JSON.stringify(makeManifest()),
      'database.db': fs.readFileSync(makeDbFile()),
      '../evil.txt': 'pwned',
    });
    const result = await validateArchive(zipPath);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.stagedDbPath).toBeNull();
  });

  it('rejects an entry outside the allowlist (evil.sh)', async () => {
    // yauzl accepts this name, so the allowlist check must catch it.
    const zipPath = await buildZip({
      'manifest.json': JSON.stringify(makeManifest()),
      'database.db': fs.readFileSync(makeDbFile()),
      'evil.sh': 'pwned',
    });
    const result = await validateArchive(zipPath);
    expect(result.errors.join(' ')).toMatch(/unsafe/i);
  });

  it('rejects a backup missing a required table', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nommable-db-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE migrations (name varchar PRIMARY KEY);
      INSERT INTO migrations (name) VALUES ('InitialSchema1788000000000');
      CREATE TABLE recipes (id varchar PRIMARY KEY);
    `);
    db.close();
    const zipPath = await buildZip({
      'manifest.json': JSON.stringify(makeManifest()),
      'database.db': fs.readFileSync(dbPath),
    });
    const result = await validateArchive(zipPath);
    expect(result.errors.join(' ')).toMatch(/missing required table/i);
  });

  it('rejects a backup from a newer version (unknown migration)', async () => {
    const zipPath = await buildZip({
      'manifest.json': JSON.stringify(
        makeManifest({ schemaVersion: ['InitialSchema1788000000000', 'FutureMigration999'] })
      ),
      'database.db': fs.readFileSync(
        makeDbFile(`INSERT INTO migrations (name) VALUES ('FutureMigration999');`)
      ),
    });
    const result = await validateArchive(zipPath);
    expect(result.errors.join(' ')).toMatch(/newer version/i);
  });

  it('rejects manifest counts that disagree with the backup database', async () => {
    const dbPath = makeDbFile(`INSERT INTO recipes (id) VALUES ('r1');`);
    const zipPath = await buildZip({
      'manifest.json': JSON.stringify(makeManifest({ counts: { ...EMPTY_COUNTS, recipes: 5 } })),
      'database.db': fs.readFileSync(dbPath),
    });
    const result = await validateArchive(zipPath);
    expect(result.errors.join(' ')).toMatch(/counts do not match/i);
  });

  it('accepts a well-formed archive and returns real counts', async () => {
    const dbPath = makeDbFile(
      `INSERT INTO recipes (id) VALUES ('r1'); INSERT INTO users (id) VALUES ('u1');`
    );
    const manifest = makeManifest({ counts: { ...EMPTY_COUNTS, recipes: 1, users: 1 } });
    const zipPath = await buildZip({
      'manifest.json': JSON.stringify(manifest),
      'database.db': fs.readFileSync(dbPath),
      'uploads/recipes/photo.jpg': Buffer.from('fake-jpeg'),
    });
    const result = await validateArchive(zipPath);
    expect(result.errors).toEqual([]);
    expect(result.counts.recipes).toBe(1);
    expect(result.counts.users).toBe(1);
    expect(result.manifest.createdAt).toBe(manifest.createdAt);
    if (result.stagedDbPath) {
      fs.rmSync(path.dirname(result.stagedDbPath), { recursive: true, force: true });
    }
  });

  it('preview rejects an invalid archive and does not stage it', async () => {
    const zipPath = await buildZip({
      'manifest.json': JSON.stringify(makeManifest({ formatVersion: 99 })),
      'database.db': fs.readFileSync(makeDbFile()),
    });
    await expect(previewRestore(zipPath, 123)).rejects.toThrow(/validation failed/i);
  });
});

describe('createBackupArchive + sidecar meta', () => {
  it('produces a valid archive of the live test DB and records last backup', async () => {
    // Production boot (index.ts) creates stored_images via
    // ImageStorageService.initialize(); tests bypass boot, so create it here.
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS "stored_images" (
        "file_path" varchar(255) PRIMARY KEY,
        "mime_type" varchar(100) NOT NULL,
        "data" blob NOT NULL,
        "created_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    const { archivePath, manifest, tmpDir } = await createBackupArchive();
    try {
      expect(fs.existsSync(archivePath)).toBe(true);
      expect(hasZipMagic(archivePath)).toBe(true);
      expect(manifest.formatVersion).toBe(BACKUP_FORMAT_VERSION);
      const validated = await validateArchive(archivePath);
      expect(validated.errors).toEqual([]);
      if (validated.stagedDbPath) {
        fs.rmSync(path.dirname(validated.stagedDbPath), { recursive: true, force: true });
      }
      const meta = readBackupMeta();
      expect(meta.lastBackupAt).toBe(manifest.createdAt);
      expect(meta.lastBackupCounts).toEqual(manifest.counts);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('readBackupMeta returns empty meta when the sidecar is missing', () => {
    const metaPath = path.join(getDataDir(), BACKUP_META_FILENAME);
    const existed = fs.existsSync(metaPath);
    const backup = existed ? fs.readFileSync(metaPath) : null;
    if (existed) fs.unlinkSync(metaPath);
    try {
      expect(readBackupMeta().lastBackupAt).toBeNull();
    } finally {
      if (backup) fs.writeFileSync(metaPath, backup);
    }
  });

  it('uses the live DB path, not a hardcoded one', () => {
    expect(config.database.path).toContain('nommable-test-');
    expect(AppDataSource.isInitialized).toBe(true);
  });
});
