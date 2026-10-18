/**
 * Round-trip test for backup & restore (issue #16): seed a DB, export,
 * wipe, preview, confirm (with a no-op exit so the test process survives),
 * re-initialize, and assert recipe / image / user / plan / list / pantry /
 * batch counts match — plus the uploads file comes back.
 *
 * This file runs the real swap path: the live test DB file and the uploads
 * directory are replaced. The original uploads tree is copied aside in
 * beforeAll and restored in afterAll, so a failure cannot lose repo files.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AppDataSource } from '../../db/data-source';
import { config } from '../../config';
import {
  BatchCookingPlan,
  MealPlan,
  PantryItem,
  Recipe,
  ShoppingList,
  User,
} from '../../db/entities';
import { UserRole } from '@nommable/shared';
import {
  clearStagedRestores,
  confirmRestore,
  createBackupArchive,
  previewRestore,
  readBackupMeta,
} from '../../services/backup/backup.service';

const SEED_COUNTS = {
  recipes: 2,
  images: 1,
  users: 2,
  mealPlans: 1,
  shoppingLists: 1,
  pantryItems: 2,
  batchPlans: 1,
};

const UPLOADS_BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nommable-uploads-orig-'));

function copyRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) copyRecursive(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

async function seed(): Promise<{ userId: string; recipeId: string }> {
  // Production boot creates stored_images via ImageStorageService.initialize();
  // tests bypass boot, so create it here (same DDL as the service).
  await AppDataSource.query(`
    CREATE TABLE IF NOT EXISTS "stored_images" (
      "file_path" varchar(255) PRIMARY KEY,
      "mime_type" varchar(100) NOT NULL,
      "data" blob NOT NULL,
      "created_at" datetime NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const userRepo = AppDataSource.getRepository(User);
  const users = await userRepo.save([
    { email: 'roundtrip-admin@test.com', username: 'roundtrip-admin', role: UserRole.ADMIN },
    { email: 'roundtrip-user@test.com', username: 'roundtrip-user', role: UserRole.USER },
  ]);
  const userId = users[0].id;

  const recipeRepo = AppDataSource.getRepository(Recipe);
  const recipes = await recipeRepo.save([
    { userId, title: 'Roundtrip Soup' },
    { userId, title: 'Roundtrip Salad' },
  ]);

  await AppDataSource.getRepository(PantryItem).save([
    { userId, name: 'Roundtrip Beans', quantity: 2, unit: 'cans', category: 'Pantry' },
    { userId, name: 'Roundtrip Rice', quantity: 1, unit: 'kg', category: 'Pantry' },
  ]);
  await AppDataSource.getRepository(MealPlan).save([
    { userId, name: 'Roundtrip Week', startDate: new Date('2026-10-19'), endDate: new Date('2026-10-25') },
  ]);
  await AppDataSource.getRepository(ShoppingList).save([{ userId, name: 'Roundtrip List' }]);
  await AppDataSource.getRepository(BatchCookingPlan).save([
    { userId, recipeId: recipes[0].id, name: 'Roundtrip Batch', cookingDate: new Date('2026-10-20') },
  ]);
  await AppDataSource.query(
    `INSERT INTO stored_images (file_path, mime_type, data) VALUES (?, ?, ?)`,
    ['recipes/roundtrip.jpg', 'image/jpeg', Buffer.from('fake-jpeg-bytes')]
  );

  const uploadFile = path.join(config.upload.dir, 'recipes', 'backup-roundtrip-test.txt');
  fs.mkdirSync(path.dirname(uploadFile), { recursive: true });
  fs.writeFileSync(uploadFile, 'roundtrip-contents');

  return { userId, recipeId: recipes[0].id };
}

async function wipeAll(): Promise<void> {
  for (const table of [
    'batch_cooking_plans',
    'meal_plans',
    'shopping_lists',
    'pantry_items',
    'recipes',
    'stored_images',
    'users',
  ]) {
    await AppDataSource.query(`DELETE FROM "${table}"`).catch(() => undefined);
  }
  fs.rmSync(config.upload.dir, { recursive: true, force: true });
}

async function getCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [key, table] of [
    ['recipes', 'recipes'],
    ['images', 'stored_images'],
    ['users', 'users'],
    ['mealPlans', 'meal_plans'],
    ['shoppingLists', 'shopping_lists'],
    ['pantryItems', 'pantry_items'],
    ['batchPlans', 'batch_cooking_plans'],
  ] as Array<[string, string]>) {
    const rows = (await AppDataSource.query(
      `SELECT COUNT(*) AS c FROM "${table}"`
    )) as Array<{ c: number }>;
    out[key] = rows[0]?.c ?? 0;
  }
  return out;
}

describe('backup/restore round-trip', () => {
  beforeAll(() => {
    if (fs.existsSync(config.upload.dir)) {
      copyRecursive(config.upload.dir, UPLOADS_BACKUP_DIR);
    }
  });

  afterAll(() => {
    clearStagedRestores();
    // Restore the original uploads tree no matter what happened mid-test.
    try {
      fs.rmSync(config.upload.dir, { recursive: true, force: true });
      if (fs.existsSync(UPLOADS_BACKUP_DIR)) {
        copyRecursive(UPLOADS_BACKUP_DIR, config.upload.dir);
      }
      fs.rmSync(UPLOADS_BACKUP_DIR, { recursive: true, force: true });
    } catch {
      // Best effort — the checkout uploads dir is gitignored seed data.
    }
  });

  it('exports, wipes, previews, restores, and matches all counts', async () => {
    const { recipeId } = await seed();
    expect(await getCounts()).toMatchObject(SEED_COUNTS);

    const { archivePath, tmpDir } = await createBackupArchive();
    expect(fs.existsSync(archivePath)).toBe(true);

    await wipeAll();
    const wiped = await getCounts();
    expect(wiped).toMatchObject({
      recipes: 0,
      images: 0,
      users: 0,
      mealPlans: 0,
      shoppingLists: 0,
      pantryItems: 0,
      batchPlans: 0,
    });
    expect(fs.existsSync(path.join(config.upload.dir, 'recipes', 'backup-roundtrip-test.txt'))).toBe(false);

    const preview = await previewRestore(archivePath, fs.statSync(archivePath).size);
    expect(preview.validation.valid).toBe(true);
    expect(preview.counts).toMatchObject(SEED_COUNTS);
    expect(preview.manifest.counts).toMatchObject(SEED_COUNTS);

    // Apply with a no-op exit so the test process survives the restart step.
    await confirmRestore(preview.token, { exitProcess: () => undefined });
    // The swap destroyed the DataSource — reconnect to the restored DB.
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    expect(await getCounts()).toMatchObject(SEED_COUNTS);
    const restoredFile = path.join(config.upload.dir, 'recipes', 'backup-roundtrip-test.txt');
    expect(fs.existsSync(restoredFile)).toBe(true);
    expect(fs.readFileSync(restoredFile, 'utf8')).toBe('roundtrip-contents');
    // The restored recipe row survives the swap.
    const recipe = await AppDataSource.getRepository(Recipe).findOneBy({ id: recipeId });
    expect(recipe?.title).toBe('Roundtrip Soup');

    const meta = readBackupMeta();
    expect(meta.lastRestoreAt).not.toBeNull();
    expect(meta.restoredFrom).toBe(preview.manifest.createdAt);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }, 60000);
});
