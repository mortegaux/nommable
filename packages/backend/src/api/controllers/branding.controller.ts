import { Response, NextFunction } from 'express';
import fs from 'fs';
import { AuthRequest } from '../middleware';
import { AppError } from '../middleware/error-handler';
import { BrandingService } from '../../services/settings/branding.service';

export class BrandingController {
  /** Public: branding is displayed on the login page and header, so any visitor may read it. */
  static async getBranding(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json(await BrandingService.getBranding());
    } catch (error) {
      next(error);
    }
  }

  /** Admin-only: update name and/or accent color. */
  static async updateBranding(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json(await BrandingService.updateBranding(req.body || {}));
    } catch (error) {
      next(error);
    }
  }

  /** Admin-only: upload a replacement header logo. Validated by multer + content check upstream. */
  static async uploadLogo(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError(400, 'No logo file uploaded');
      }
      try {
        res.json(await BrandingService.setLogo(req.file.filename));
      } catch (error) {
        // Don't orphan the uploaded file if the DB write fails.
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          // Best effort.
        }
        throw error;
      }
    } catch (error) {
      next(error);
    }
  }

  /** Admin-only: remove the custom logo (falls back to the stock logo). */
  static async removeLogo(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json(await BrandingService.clearLogo());
    } catch (error) {
      next(error);
    }
  }

  /** Admin-only: upload a replacement favicon. Validated by multer + content check upstream. */
  static async uploadFavicon(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError(400, 'No favicon file uploaded');
      }
      try {
        res.json(await BrandingService.setFavicon(req.file.filename));
      } catch (error) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          // Best effort.
        }
        throw error;
      }
    } catch (error) {
      next(error);
    }
  }

  /** Admin-only: remove the custom favicon (falls back to the stock favicons). */
  static async removeFavicon(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json(await BrandingService.clearFavicon());
    } catch (error) {
      next(error);
    }
  }

  /** Admin-only: restore stock branding (name, logo, accent, favicon). */
  static async resetBranding(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json(await BrandingService.resetBranding());
    } catch (error) {
      next(error);
    }
  }
}
