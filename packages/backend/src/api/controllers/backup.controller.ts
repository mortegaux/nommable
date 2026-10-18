/**
 * Backup & restore endpoints (issue #16) — admin-only.
 *
 * GET  /api/settings/backup/export           — stream a full backup archive
 * POST /api/settings/backup/restore/preview   — upload archive, validate, preview
 * POST /api/settings/backup/restore/confirm   — apply a previewed restore
 *
 * Restore is a two-step flow: preview validates and stages the archive
 * (nothing applied), confirm requires the preview token + confirmed: true.
 * On confirm the server safety-backs-up current state, swaps DB + uploads,
 * and exits so the orchestrator restarts it on the restored data.
 */
import { Response, NextFunction } from 'express';
import fs from 'fs';
import { AuthRequest } from '../middleware';
import { AppError } from '../middleware/error-handler';
import {
  confirmRestore,
  createBackupArchive,
  previewRestore,
} from '../../services/backup/backup.service';

export class BackupController {
  /** Stream a full backup archive (DB snapshot + uploads + manifest). */
  static async exportBackup(_req: AuthRequest, res: Response, next: NextFunction) {
    let tmpDir: string | null = null;
    const cleanup = () => {
      if (tmpDir) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          // Best effort.
        }
        tmpDir = null;
      }
    };
    try {
      const { archivePath, manifest, tmpDir: dir } = await createBackupArchive();
      tmpDir = dir;
      const filename = `nommable-backup-${manifest.createdAt.replace(/[:.]/g, '-')}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      const stream = fs.createReadStream(archivePath);
      stream.on('error', (err) => {
        cleanup();
        next(err);
      });
      res.on('finish', cleanup);
      res.on('close', cleanup);
      stream.pipe(res);
    } catch (error) {
      cleanup();
      next(error);
    }
  }

  /** Upload a backup archive, validate it, and return a preview (nothing applied). */
  static async previewRestore(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError(400, 'No backup archive uploaded');
      }
      const preview = await previewRestore(req.file.path, req.file.size);
      res.json(preview);
    } catch (error) {
      // A rejected upload must not leave the archive on disk.
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          // Already gone.
        }
      }
      next(error);
    }
  }

  /** Apply a previewed restore. Requires the preview token + confirmed: true. */
  static async confirmRestore(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { token, confirmed } = req.body || {};
      if (typeof token !== 'string' || !token) {
        throw new AppError(
          400,
          'Restore token is required — upload a backup and preview it first'
        );
      }
      if (confirmed !== true) {
        throw new AppError(400, 'Restore requires explicit confirmation');
      }
      await confirmRestore(token);
      res.json({
        message: 'Restore applied. The server is restarting on the restored data.',
        restarting: true,
      });
    } catch (error) {
      next(error);
    }
  }
}
