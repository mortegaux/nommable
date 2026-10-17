import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { config } from '../../config';
import { AppError } from './error-handler';
import {
  ALLOWED_MIMES,
  EXTRACTION_ALLOWED_MIMES,
  mimeToExt,
  detectImageType,
} from '../../utils/image-validation';

// Re-exported so existing import sites keep working.
export { detectImageType, ALLOWED_MIMES };

// Ensure uploads directories exist in resolved upload directory
const getDir = (subdir: string) => {
  const dir = path.join(config.upload.dir, subdir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const uploadsDir = getDir('recipes');
const profilesDir = getDir('profiles');

/**
 * Middleware to run after multer: verifies each uploaded file's actual content
 * matches an allowed image type. Rejects spoofed files (e.g. an SVG or script
 * renamed to .jpg) and deletes them from disk.
 */
export const validateImageContent = (req: Request, _res: Response, next: NextFunction) => {
  const files: Express.Multer.File[] = [];
  if (req.file) files.push(req.file);
  if (req.files) {
    if (Array.isArray(req.files)) files.push(...req.files);
    else Object.values(req.files).forEach((arr) => files.push(...arr));
  }

  for (const file of files) {
    let head: Buffer;
    try {
      head = file.buffer ? file.buffer.subarray(0, 12) : fs.readFileSync(file.path).subarray(0, 12);
    } catch {
      if (file.path) fs.unlink(file.path, () => undefined);
      return next(new AppError(400, 'Could not read uploaded file'));
    }
    const detected = detectImageType(head);
    if (!detected || !ALLOWED_MIMES.has(detected)) {
      if (file.path) fs.unlink(file.path, () => undefined);
      return next(
        new AppError(400, 'Invalid image file: content does not match a supported image type')
      );
    }
  }
  next();
};

// Configure storage
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    // Generate unique filename: timestamp-randomstring.ext
    // mimetype is guaranteed to be in the allowlist by fileFilter, so the
    // extension always comes from our map — never the client filename.
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = mimeToExt[file.mimetype] || '.bin';
    cb(null, `recipe-${uniqueSuffix}${ext}`);
  },
});

// File filter - strict allowlist only. The previous `mimetype.startsWith('image/')`
// fallback was removed: it let through `image/svg+xml` (stored XSS vector) and
// any other client-spoofed image/* type.
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    // AppError (not plain Error) so the error handler returns 400, not 500.
    cb(new AppError(400, `Invalid file type: ${file.mimetype}. Only image files are allowed.`));
  }
};

// Multer configuration
export const recipeImageUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
});

// File filter for recipe extraction - accept images only
const extractionFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (EXTRACTION_ALLOWED_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    // AppError (not plain Error) so the error handler returns 400, not 500.
    cb(new AppError(400, `Invalid file type: ${file.mimetype}. Only image files are allowed.`));
  }
};

// Multer configuration for recipe extraction from images
// Uses memory storage since we process files immediately without saving
export const recipeExtractionUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: extractionFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size (for high-res mobile camera photos)
    files: 5, // Maximum 5 files
  },
});

// Configure storage for profile photos
const profileStorage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, profilesDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = mimeToExt[file.mimetype] || '.bin';
    cb(null, `profile-${uniqueSuffix}${ext}`);
  },
});

// Multer configuration for profile photos
export const profilePhotoUpload = multer({
  storage: profileStorage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
});
