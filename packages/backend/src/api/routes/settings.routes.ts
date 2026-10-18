import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller';
import { authMiddleware, requireAdmin } from '../middleware';

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

// Email / SMTP configuration endpoints
router.get('/smtp', requireAdmin, SettingsController.getSmtpSettings);
router.put('/smtp', requireAdmin, SettingsController.saveSmtpSettings);
router.post('/smtp/test', requireAdmin, SettingsController.testSmtpSettings);

export default router;
