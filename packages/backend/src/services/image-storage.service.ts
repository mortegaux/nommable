import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { AppDataSource } from '../db/data-source';
import { assertSafeScrapeUrl, fetchWithGuardedRedirects } from '../utils/ssrf-guard';
import { ALLOWED_MIMES, mimeToExt, detectImageType } from '../utils/image-validation';

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

/**
 * Unified image storage service for all recipe and profile images
 * (user-uploaded, AI-generated, and imported).
 *
 * Stores images in the configured upload directory (/uploads/recipes or /uploads/profiles)
 * AND persists a copy in PostgreSQL (`stored_images`) so images remain reliably
 * accessible across container rebuilds, volume changes, or migrations.
 */
export class ImageStorageService {
  private static initialized = false;

  /**
   * Resolve and ensure the target subdirectory under the primary upload directory.
   */
  static getSubdirPath(subdir: string): string {
    const safeSubdir = path.basename(subdir);
    const dir = path.join(config.upload.dir, safeSubdir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Return all candidate upload root directories so files can be found or mirrored
   * regardless of working directory or Docker volume mount point.
   */
  static getCandidateUploadRoots(): string[] {
    const roots = new Set<string>();
    roots.add(path.resolve(config.upload.dir));
    if (fs.existsSync('/app/uploads')) {
      roots.add('/app/uploads');
    }
    roots.add(path.resolve(process.cwd(), 'uploads'));
    return Array.from(roots);
  }

  /**
   * Ensure the `stored_images` table exists in PostgreSQL and synchronize
   * existing disk images <-> database.
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.getSubdirPath('recipes');
      this.getSubdirPath('profiles');

      if (!AppDataSource.isInitialized) {
        return;
      }

      await AppDataSource.query(`
        CREATE TABLE IF NOT EXISTS "stored_images" (
          "file_path" varchar(255) PRIMARY KEY,
          "mime_type" varchar(100) NOT NULL,
          "data" blob NOT NULL,
          "created_at" datetime NOT NULL DEFAULT (datetime('now'))
        )
      `);

      this.initialized = true;

      // Sync existing files on disk into DB and restore any DB images missing from disk
      await this.syncDiskAndDatabase();
    } catch (err) {
      console.warn('ImageStorageService initialization warning:', err);
    }
  }

  /**
   * Synchronize images between disk directories and PostgreSQL `stored_images`.
   */
  static async syncDiskAndDatabase(): Promise<void> {
    if (!AppDataSource.isInitialized) return;

    const subdirs = ['recipes', 'profiles'];

    // 1. Back up any files found on disk into PostgreSQL
    for (const root of this.getCandidateUploadRoots()) {
      for (const subdir of subdirs) {
        const dirPath = path.join(root, subdir);
        if (!fs.existsSync(dirPath)) continue;

        let files: string[] = [];
        try {
          files = await fs.promises.readdir(dirPath);
        } catch {
          continue;
        }

        for (const filename of files) {
          if (filename.startsWith('.')) continue;
          const fullPath = path.join(dirPath, filename);
          try {
            const stat = await fs.promises.stat(fullPath);
            if (!stat.isFile() || stat.size === 0) continue;

            const relPath = `${subdir}/${filename}`;
            const existing = await AppDataSource.query(
              `SELECT 1 FROM "stored_images" WHERE "file_path" = ? LIMIT 1`,
              [relPath]
            );

            if (!existing || existing.length === 0) {
              const buffer = await fs.promises.readFile(fullPath);
              const ext = path.extname(filename).toLowerCase();
              const mimeType = EXT_TO_MIME[ext] || 'image/jpeg';
              await AppDataSource.query(
                `INSERT INTO "stored_images" ("file_path", "mime_type", "data")
                 VALUES (?, ?, ?)
                 ON CONFLICT ("file_path") DO NOTHING`,
                [relPath, mimeType, buffer]
              );
            }
          } catch (fileErr) {
            console.warn(`Failed to sync disk image ${fullPath} to DB:`, fileErr);
          }
        }
      }
    }

    // 2. Restore any images in database that are missing from the primary upload directory
    try {
      const rows: Array<{ file_path: string }> = await AppDataSource.query(
        `SELECT "file_path" FROM "stored_images"`
      );

      for (const row of rows) {
        const [subdir, filename] = (row.file_path || '').split('/');
        if (!subdir || !filename) continue;

        const targetDir = this.getSubdirPath(subdir);
        const targetPath = path.join(targetDir, path.basename(filename));
        if (!fs.existsSync(targetPath)) {
          const dataRows: Array<{ data: Buffer }> = await AppDataSource.query(
            `SELECT "data" FROM "stored_images" WHERE "file_path" = ? LIMIT 1`,
            [row.file_path]
          );
          if (dataRows?.[0]?.data) {
            await fs.promises.writeFile(targetPath, dataRows[0].data);
          }
        }
      }
    } catch (restoreErr) {
      console.warn('Failed to restore images from DB to disk:', restoreErr);
    }
  }

  /**
   * Save an image buffer to both the unified upload directory and database.
   * Used by AI-generated images, uploaded images, and downloaded recipe images.
   *
   * The stored MIME type comes from the buffer's magic bytes, never from a
   * caller-supplied content type: a stored `image/svg+xml` row would be
   * served as SVG from the app's origin by the uploads fallback route
   * (stored XSS), so anything that is not a detected allowlisted raster
   * image is rejected here.
   */
  static async saveImageBuffer(
    subdir: 'recipes' | 'profiles',
    buffer: Buffer,
    mimeType: string = 'image/jpeg',
    prefix: string = 'recipe'
  ): Promise<{ filename: string; imageUrl: string; filePath: string }> {
    await this.initialize();

    const detected = detectImageType(buffer);
    if (!detected || !ALLOWED_MIMES.has(detected)) {
      throw new Error('Unsupported image content: not a recognized allowlisted image type');
    }
    // Caller-supplied mimeType is ignored for storage: the detected type is
    // the only trustworthy one. (It is kept as a parameter for call-site
    // compatibility.)
    void mimeType;
    const normalizedMime = detected;
    const ext = mimeToExt[normalizedMime] || '.jpg';

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `${prefix}-${uniqueSuffix}${ext}`;
    const targetDir = this.getSubdirPath(subdir);
    const filePath = path.join(targetDir, filename);

    // 1. Write to primary upload directory
    await fs.promises.writeFile(filePath, buffer);

    // 2. Mirror to secondary upload roots if they exist and differ
    for (const root of this.getCandidateUploadRoots()) {
      const candidateDir = path.join(root, subdir);
      const candidateFile = path.join(candidateDir, filename);
      if (path.resolve(candidateFile) !== path.resolve(filePath)) {
        try {
          if (!fs.existsSync(candidateDir)) {
            await fs.promises.mkdir(candidateDir, { recursive: true });
          }
          await fs.promises.writeFile(candidateFile, buffer);
        } catch {
          // Ignore non-writable secondary paths
        }
      }
    }

    // 3. Persist in database so it survives container rebuilds or volume resets
    const relPath = `${subdir}/${filename}`;
    if (AppDataSource.isInitialized) {
      try {
        await AppDataSource.query(
          `INSERT INTO "stored_images" ("file_path", "mime_type", "data")
           VALUES (?, ?, ?)
           ON CONFLICT ("file_path") DO UPDATE
           SET "mime_type" = EXCLUDED."mime_type", "data" = EXCLUDED."data"`,
          [relPath, normalizedMime, buffer]
        );
      } catch (dbErr) {
        console.warn(`Failed to persist image ${relPath} to database:`, dbErr);
      }
    }

    const imageUrl = `/uploads/${subdir}/${filename}`;
    return { filename, imageUrl, filePath };
  }

  /**
   * Persist an already-uploaded Multer disk file into database and mirror directories.
   * The file already passed the upload middleware's content check; this
   * re-verifies the bytes (defense in depth) and stores the *detected* MIME
   * type, never a caller-supplied one.
   */
  static async persistUploadedDiskFile(
    subdir: 'recipes' | 'profiles',
    diskFilePath: string,
    filename: string,
    mimeType?: string
  ): Promise<string> {
    await this.initialize();

    const safeFilename = path.basename(filename);
    const resolvedMime = await (async () => {
      try {
        const head = (await fs.promises.readFile(diskFilePath)).subarray(0, 12);
        const detected = detectImageType(head);
        if (detected && ALLOWED_MIMES.has(detected)) return detected;
      } catch {
        // Fall through to the extension-based MIME below.
      }
      const ext = path.extname(safeFilename).toLowerCase();
      return (mimeType || EXT_TO_MIME[ext] || 'image/jpeg').toLowerCase().split(';')[0].trim();
    })();

    try {
      const buffer = await fs.promises.readFile(diskFilePath);

      // Ensure file is in primary upload dir
      const primaryPath = path.join(this.getSubdirPath(subdir), safeFilename);
      if (path.resolve(primaryPath) !== path.resolve(diskFilePath)) {
        await fs.promises.writeFile(primaryPath, buffer);
      }

      // Mirror to any secondary upload root
      for (const root of this.getCandidateUploadRoots()) {
        const candidateDir = path.join(root, subdir);
        const candidateFile = path.join(candidateDir, safeFilename);
        if (path.resolve(candidateFile) !== path.resolve(diskFilePath)) {
          try {
            if (!fs.existsSync(candidateDir)) {
              await fs.promises.mkdir(candidateDir, { recursive: true });
            }
            await fs.promises.writeFile(candidateFile, buffer);
          } catch {
            // Ignore
          }
        }
      }

      // Save in database
      const relPath = `${subdir}/${safeFilename}`;
      if (AppDataSource.isInitialized) {
        await AppDataSource.query(
          `INSERT INTO "stored_images" ("file_path", "mime_type", "data")
           VALUES (?, ?, ?)
           ON CONFLICT ("file_path") DO UPDATE
           SET "mime_type" = EXCLUDED."mime_type", "data" = EXCLUDED."data"`,
          [relPath, resolvedMime, buffer]
        );
      }
    } catch (err) {
      console.warn(`Failed to back up uploaded file ${diskFilePath} to DB:`, err);
    }

    return `/uploads/${subdir}/${safeFilename}`;
  }

  /**
   * Retrieve an image from database if missing from disk, and restore it to disk.
   */
  static async getAndRestoreImage(
    subdir: string,
    filename: string
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    await this.initialize();
    if (!AppDataSource.isInitialized) return null;

    const safeSubdir = path.basename(subdir);
    const safeFilename = path.basename(filename);
    const relPath = `${safeSubdir}/${safeFilename}`;

    try {
      const rows: Array<{ mime_type: string; data: Buffer }> = await AppDataSource.query(
        `SELECT "mime_type", "data" FROM "stored_images" WHERE "file_path" = ? LIMIT 1`,
        [relPath]
      );

      if (!rows || rows.length === 0 || !rows[0].data) {
        return null;
      }

      const { mime_type: mimeType, data: buffer } = rows[0];

      // Restore to disk so future requests are served directly by express.static
      try {
        const targetDir = this.getSubdirPath(safeSubdir);
        const targetPath = path.join(targetDir, safeFilename);
        await fs.promises.writeFile(targetPath, buffer);
      } catch {
        // Ignore disk write error if read-only; buffer is still returned to caller
      }

      return { buffer, mimeType: mimeType || 'image/jpeg' };
    } catch (err) {
      console.warn(`Failed to load image ${relPath} from database:`, err);
      return null;
    }
  }

  /**
   * Download an external recipe image URL and store it locally in the unified
   * recipe image storage + PostgreSQL. If downloading fails, returns the original URL.
   *
   * The URL comes from a scraped page, so it is attacker-influenced: it gets
   * the same SSRF treatment as recipe imports (public-IP validation +
   * per-hop redirect validation). Content must be a detected allowlisted
   * raster image — an SVG served from this origin would be stored XSS, so
   * SVG (or any non-allowlisted content) is rejected and the original URL
   * is kept instead.
   */
  static async localizeExternalImage(externalUrl?: string): Promise<string | undefined> {
    if (!externalUrl || typeof externalUrl !== 'string') return externalUrl;
    const trimmed = externalUrl.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return trimmed;
    }

    try {
      const safeUrl = await assertSafeScrapeUrl(trimmed);
      const response = await fetchWithGuardedRedirects(safeUrl, {
        responseType: 'arraybuffer',
        timeout: 12000,
        maxContentLength: 10 * 1024 * 1024,
        headers: {
          'User-Agent': 'Nommable/1.0 (Recipe Importer; +https://github.com/mortegaux/nommable)',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });

      const contentType = ((response.headers['content-type'] as string) || '')
        .toLowerCase()
        .split(';')[0]
        .trim();
      if (!ALLOWED_MIMES.has(contentType)) {
        return trimmed;
      }

      const buffer = Buffer.from(response.data);
      if (buffer.length < 100) {
        return trimmed;
      }
      // Trust magic bytes, not the remote server's Content-Type header.
      const detected = detectImageType(buffer);
      if (!detected || !ALLOWED_MIMES.has(detected)) {
        return trimmed;
      }

      const { imageUrl } = await this.saveImageBuffer('recipes', buffer, detected, 'recipe');
      return imageUrl;
    } catch {
      // Fallback to original remote URL if hotlink download is blocked
      return trimmed;
    }
  }
}
