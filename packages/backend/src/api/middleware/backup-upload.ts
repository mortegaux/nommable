/**
 * Multer upload for restore archives (issue #16).
 *
 * The archive is written to a staging dir on disk (never memory — backups
 * can be large) with a random filename. Content validation happens in the
 * backup service (zip magic, manifest, schema), not here: mimetype and
 * extension are client-spoofable, so this middleware only enforces the
 * .zip extension as a first-pass filter plus the size/file-count limits.
 */
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AppError } from './error-handler';
import { MAX_RESTORE_ARCHIVE_BYTES } from '../../services/backup/backup.service';

export const restoreArchiveUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(os.tmpdir(), 'nommable-restore-uploads');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, _file, cb) => {
      cb(null, `restore-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.zip`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new AppError(400, 'Restore file must be a .zip backup archive'));
    }
  },
  limits: {
    fileSize: MAX_RESTORE_ARCHIVE_BYTES, // 1 GiB
    files: 1,
  },
});
