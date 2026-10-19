/**
 * Tests for the server-backup list / download / preview-server endpoints
 * (issue #74): admin-only list of on-disk backups under <dataDir>/backups/,
 * per-entry download + restore-from-server, traversal rejection, and
 * graceful degradation for corrupt/unreadable entries.
 *
 * Service-level tests use a temp dir (via the `backupsDir` parameter) so
 * they never touch the real backups dir. Route tests hit the real app but
 * only use unique filenames and clean them up.
 */
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApp } from '../../app';
import { createTestToken } from '../helpers/auth';
import { AppDataSource } from '../../db/data-source';
import { User } from '../../db/entities';
import { UserRole } from '@nommable/shared';
import {
  clearStagedRestores,
  createBackupArchive,
  getBackupsDir,
  listServerBackups,
  previewServerBackup,
  resolveServerBackupPath,
} from '../../services/backup/backup.service';

const app = createApp();

const ADMIN_ID = 'eeeeeeee-7777-7777-7777-000000000074';
const USER_ID = 'ffffffff-8888-8888-8888-000000000074';

async function createTestUser(id: string, role: UserRole): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  await userRepo
    .createQueryBuilder()
    .insert()
    .into(User)
    .values({
      id,
      email: `backuplist-test-${id.slice(0, 8)}@test.com`,
      username: `backuplist-user-${id.slice(0, 8)}`,
      role,
    })
    .orIgnore()
    .execute();
}

describe('listServerBackups (service)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nommable-list-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns an empty list when the directory does not exist', () => {
    expect(listServerBackups(path.join(tmpDir, 'no-such-dir'))).toEqual({ backups: [] });
  });

  it('returns an empty list for an empty directory', () => {
    expect(listServerBackups(tmpDir)).toEqual({ backups: [] });
  });

  it('classifies safety vs export, newest first, and degrades gracefully', () => {
    const safety = path.join(tmpDir, 'safety-2026-10-18T12-00-00-000Z.zip');
    const exported = path.join(tmpDir, 'nommable-backup-2026-10-18T13-00-00-000Z.zip');
    const notZip = path.join(tmpDir, 'notes.txt');
    const empty = path.join(tmpDir, 'empty.zip');
    const subdir = path.join(tmpDir, 'weird-dir.zip');
    fs.writeFileSync(safety, Buffer.alloc(100, 1));
    fs.writeFileSync(exported, Buffer.alloc(200, 2));
    fs.writeFileSync(notZip, 'hello');
    fs.writeFileSync(empty, Buffer.alloc(0));
    fs.mkdirSync(subdir);
    // Deterministic mtimes: safety older, export newer, junk oldest.
    const old = new Date('2026-10-18T11:00:00Z');
    fs.utimesSync(safety, new Date('2026-10-18T12:00:00Z'), new Date('2026-10-18T12:00:00Z'));
    fs.utimesSync(exported, new Date('2026-10-18T13:00:00Z'), new Date('2026-10-18T13:00:00Z'));
    fs.utimesSync(notZip, old, old);
    fs.utimesSync(empty, old, old);
    fs.utimesSync(subdir, old, old);

    const { backups } = listServerBackups(tmpDir);
    const byName = new Map(backups.map((b) => [b.name, b]));

    expect(backups[0]?.name).toBe('nommable-backup-2026-10-18T13-00-00-000Z.zip');
    expect(byName.get('safety-2026-10-18T12-00-00-000Z.zip')).toMatchObject({
      kind: 'safety',
      status: 'ok',
      sizeBytes: 100,
    });
    expect(byName.get('nommable-backup-2026-10-18T13-00-00-000Z.zip')).toMatchObject({
      kind: 'export',
      status: 'ok',
      sizeBytes: 200,
    });
    expect(byName.get('notes.txt')?.status).toBe('unreadable');
    expect(byName.get('notes.txt')?.error).toMatch(/not a \.zip/i);
    expect(byName.get('empty.zip')?.status).toBe('unreadable');
    expect(byName.get('empty.zip')?.error).toMatch(/empty/i);
    expect(byName.get('weird-dir.zip')?.status).toBe('unreadable');
    // Names are basenames only — never absolute paths.
    for (const entry of backups) {
      expect(entry.name).not.toContain('/');
      expect(entry.name).not.toContain('\\');
      expect(path.isAbsolute(entry.name)).toBe(false);
    }
  });
});

describe('resolveServerBackupPath (service)', () => {
  it('rejects traversal, absolute paths, separators, and non-zip names', () => {
    for (const bad of [
      '../secret.zip',
      '..\\secret.zip',
      'sub/dir.zip',
      '/etc/passwd',
      '',
      '.',
      '..',
      'backup.txt',
      'backup.zip/extra',
    ]) {
      expect(() => resolveServerBackupPath(bad, '/tmp/x')).toThrow(/Invalid backup name/);
    }
  });

  it('resolves a plain basename inside the backups dir', () => {
    const resolved = resolveServerBackupPath('safety-1.zip', '/tmp/backups');
    expect(resolved).toBe(path.join('/tmp/backups', 'safety-1.zip'));
  });
});

describe('previewServerBackup (service)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nommable-preview-test-'));
  });

  afterEach(() => {
    clearStagedRestores();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects a missing file with 404', async () => {
    await expect(previewServerBackup('nope.zip', tmpDir)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('rejects an invalid archive with 400 and leaves the original intact', async () => {
    const bad = path.join(tmpDir, 'bad.zip');
    fs.writeFileSync(bad, 'not a zip at all');
    await expect(previewServerBackup('bad.zip', tmpDir)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(fs.existsSync(bad)).toBe(true);
  });

  it('previews a valid archive from a copy (original untouched)', async () => {
    // Production boot creates stored_images via ImageStorageService.initialize();
    // the test DB needs it before a backup can validate (see roundtrip test).
    await AppDataSource.query(
      `CREATE TABLE IF NOT EXISTS "stored_images" (
        "id" varchar PRIMARY KEY NOT NULL,
        "file_path" varchar NOT NULL,
        "mime_type" varchar NOT NULL,
        "data" blob NOT NULL,
        "created_at" datetime NOT NULL DEFAULT (datetime('now'))
      )`
    );
    const { archivePath, tmpDir: buildDir } = await createBackupArchive();
    try {
      const name = 'nommable-backup-valid.zip';
      fs.copyFileSync(archivePath, path.join(tmpDir, name));
      const preview = await previewServerBackup(name, tmpDir);
      expect(preview.token).toBeTruthy();
      expect(preview.manifest.formatVersion).toBe(1);
      // The original server file is still there — only the staging copy is staged.
      expect(fs.existsSync(path.join(tmpDir, name))).toBe(true);
    } finally {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
  });
});

describe('server backup routes (issue #74)', () => {
  let adminToken: string;
  let userToken: string;
  const createdFiles: string[] = [];

  beforeEach(async () => {
    await createTestUser(ADMIN_ID, UserRole.ADMIN);
    await createTestUser(USER_ID, UserRole.USER);
    adminToken = createTestToken(ADMIN_ID);
    userToken = createTestToken(USER_ID);
  });

  afterEach(() => {
    clearStagedRestores();
    for (const file of createdFiles.splice(0)) {
      try {
        fs.unlinkSync(path.join(getBackupsDir(), file));
      } catch {
        // Already gone.
      }
    }
  });

  it('list returns 401 without a session, 403 for non-admin', async () => {
    await request(app).get('/api/settings/backup/list').expect(401);
    await request(app)
      .get('/api/settings/backup/list')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('list returns entries with basenames only', async () => {
    const name = `safety-list-test-${Date.now()}.zip`;
    fs.mkdirSync(getBackupsDir(), { recursive: true });
    fs.writeFileSync(path.join(getBackupsDir(), name), Buffer.alloc(50, 3));
    createdFiles.push(name);
    const res = await request(app)
      .get('/api/settings/backup/list')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(res.body.backups)).toBe(true);
    const entry = res.body.backups.find((b: { name: string }) => b.name === name);
    expect(entry).toMatchObject({ kind: 'safety', status: 'ok', sizeBytes: 50 });
    expect(entry.name).not.toContain('/');
  });

  it('download rejects traversal with 400 and missing files with 404', async () => {
    await request(app)
      .get('/api/settings/backup/download/..%2Fsecret.zip')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app)
      .get('/api/settings/backup/download/nope-not-here.zip')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('download returns 401/403 for non-admins', async () => {
    await request(app).get('/api/settings/backup/download/x.zip').expect(401);
    await request(app)
      .get('/api/settings/backup/download/x.zip')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('download streams a server backup with an attachment disposition', async () => {
    const name = `export-download-test-${Date.now()}.zip`;
    const payload = Buffer.alloc(64, 7);
    fs.mkdirSync(getBackupsDir(), { recursive: true });
    fs.writeFileSync(path.join(getBackupsDir(), name), payload);
    createdFiles.push(name);
    const res = await request(app)
      .get(`/api/settings/backup/download/${name}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((res2, cb) => {
        const chunks: Buffer[] = [];
        res2.on('data', (c: Buffer) => chunks.push(c));
        res2.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-disposition']).toContain(`filename="${name}"`);
    expect((res.body as Buffer).equals(payload)).toBe(true);
  });

  it('preview-server rejects missing files with 404 and requires admin', async () => {
    await request(app)
      .post('/api/settings/backup/restore/preview-server')
      .send({ name: 'nope.zip' })
      .expect(401);
    await request(app)
      .post('/api/settings/backup/restore/preview-server')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'nope.zip' })
      .expect(403);
    await request(app)
      .post('/api/settings/backup/restore/preview-server')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'nope.zip' })
      .expect(404);
  });

  it('preview-server previews a valid server backup', async () => {
    // Production boot creates stored_images via ImageStorageService.initialize();
    // the test DB needs it before a backup can validate (see roundtrip test).
    await AppDataSource.query(
      `CREATE TABLE IF NOT EXISTS "stored_images" (
        "id" varchar PRIMARY KEY NOT NULL,
        "file_path" varchar NOT NULL,
        "mime_type" varchar NOT NULL,
        "data" blob NOT NULL,
        "created_at" datetime NOT NULL DEFAULT (datetime('now'))
      )`
    );
    const { archivePath, tmpDir: buildDir } = await createBackupArchive();
    const name = `nommable-backup-preview-${Date.now()}.zip`;
    try {
      fs.mkdirSync(getBackupsDir(), { recursive: true });
      fs.copyFileSync(archivePath, path.join(getBackupsDir(), name));
      createdFiles.push(name);
      const res = await request(app)
        .post('/api/settings/backup/restore/preview-server')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name })
        .expect(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.manifest.formatVersion).toBe(1);
      // Original still on disk (preview stages a copy).
      expect(fs.existsSync(path.join(getBackupsDir(), name))).toBe(true);
    } finally {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
  });
});
