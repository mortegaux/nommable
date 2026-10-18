import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller';
import { BackupController } from '../controllers/backup.controller';
import { authMiddleware, requireAdmin } from '../middleware';
import { restoreArchiveUpload } from '../middleware/backup-upload';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// General system settings (shared recipe catalog mode, etc.)
router.get('/general', SettingsController.getGeneralSettings);
router.put('/general', requireAdmin, SettingsController.updateGeneralSettings);

// System status (issue #23) — read-only admin diagnostics, no auto-update.
router.get('/system', requireAdmin, SettingsController.getSystemStatus);

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
