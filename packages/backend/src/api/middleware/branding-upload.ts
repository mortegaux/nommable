import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { config } from '../../config';
import { AppError } from './error-handler';
import { ALLOWED_MIMES, mimeToExt } from '../../utils/image-validation';

// Re-exported so the settings routes can chain the same content check
// the recipe/profile uploads use.
export { validateImageContent } from './upload';

const brandingDir = (() => {
  const dir = path.join(config.upload.dir, 'branding');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
})();

const brandingStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, brandingDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    // Extension always comes from our MIME map — never the client filename.
    // Prefix matches the upload kind so a logo can never be mistaken for a
    // favicon (and vice versa) by a later reader.
    const kind = file.fieldname === 'favicon' ? 'favicon' : 'logo';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = mimeToExt[file.mimetype] || '.bin';
    cb(null, `${kind}-${uniqueSuffix}${ext}`);
  },
});

const brandingFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    // AppError (not plain Error) so the error handler returns 400, not 500.
    cb(new AppError(400, `Invalid file type: ${file.mimetype}. Only image files are allowed.`));
  }
};

/**
 * Multer configuration for branding logo / favicon uploads.
 * Same validation as the other image uploads: strict MIME allowlist,
 * MIME-derived extension, 5MB cap. The content check (`validateImageContent`)
 * runs after multer in the route chain and rejects spoofed files.
 */
export const brandingUpload = multer({
  storage: brandingStorage,
  fileFilter: brandingFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size, same as recipe/profile uploads
    files: 1,
  },
});
