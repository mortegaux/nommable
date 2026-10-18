import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller';
import { BrandingController } from '../controllers/branding.controller';
import { BackupController } from '../controllers/backup.controller';
import { authMiddleware, requireAdmin } from '../middleware';
import { restoreArchiveUpload } from '../middleware/backup-upload';
import { brandingUpload, validateImageContent } from '../middleware/branding-upload';

const router = Router();

// Public instance branding (issue #55) — must be BEFORE router.use(authMiddleware):
// the login page and header need branding without a session. Read-only;
// every mutation below is admin-only.
router.get('/branding', BrandingController.getBranding);

// All routes below require authentication
router.use(authMiddleware);

// General system settings (shared recipe catalog mode, etc.)
router.get('/general', SettingsController.getGeneralSettings);
router.put('/general', requireAdmin, SettingsController.updateGeneralSettings);

// System status (issue #23) — read-only admin diagnostics, no auto-update.
router.get('/system', requireAdmin, SettingsController.getSystemStatus);

// Instance branding (issue #55) — admin-only mutations. Logo/favicon uploads
// use the same validation as the other image uploads: strict MIME allowlist,
// MIME-derived extension, 5MB cap, plus a magic-byte content check.
router.put('/branding', requireAdmin, BrandingController.updateBranding);
router.post(
  '/branding/logo',
  requireAdmin,
  brandingUpload.single('logo'),
  validateImageContent,
  BrandingController.uploadLogo
);
router.delete('/branding/logo', requireAdmin, BrandingController.removeLogo);
router.post(
  '/branding/favicon',
  requireAdmin,
  brandingUpload.single('favicon'),
  validateImageContent,
  BrandingController.uploadFavicon
);
router.delete('/branding/favicon', requireAdmin, BrandingController.removeFavicon);
router.post('/branding/reset', requireAdmin, BrandingController.resetBranding);

// Data management endpoints
router.delete('/data/clear', requireAdmin, SettingsController.clearData);

// Backup & restore (issue #16) — admin-only. Restore is two-step:
// preview validates + stages, confirm applies (safety backup → swap → restart).
router.get('/backup/export', requireAdmin, BackupController.exportBackup);
router.post(
  '/backup/restore/preview',
  requireAdmin,
  restoreArchiveUpload.single('archive'),
  BackupController.previewRestore
);
router.post('/backup/restore/confirm', requireAdmin, BackupController.confirmRestore);

// Email / SMTP configuration endpoints
router.get('/smtp', requireAdmin, SettingsController.getSmtpSettings);
router.put('/smtp', requireAdmin, SettingsController.saveSmtpSettings);
router.post('/smtp/test', requireAdmin, SettingsController.testSmtpSettings);

export default router;
