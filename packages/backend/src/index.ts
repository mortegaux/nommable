import { config } from './config';
import { initializeDatabase } from './db/startup';
import { AdminInitService } from './services/admin/admin-init.service';
import { TaxonomyService } from './services/taxonomy/taxonomy.service';
import { ImageStorageService } from './services/image-storage.service';
import { EmailService } from './services/email/email.service';
import { SystemSettingsService } from './services/settings/system-settings.service';
import { createApp } from './app';

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

async function bootstrap() {
  // Initialize the database. Migration / corruption / downgrade failures
  // are fail-fast with an actionable error (see db/startup.ts); only
  // transient connection failures are retried. Never serves traffic
  // without a healthy, current-schema database.
  await initializeDatabase();
  console.log('✓ Database connected');

  // Initialize unified image storage (sync disk <-> PostgreSQL)
  await ImageStorageService.initialize();
  console.log('✓ Image storage initialized');

  // Initialize SMTP settings table
  await EmailService.initialize();
  console.log('✓ Email settings initialized');

  // Initialize system settings table (e.g., shared recipe catalog toggle)
  await SystemSettingsService.initialize();
  console.log('✓ System settings initialized');

  // Only seed admin on boot if SEED_ADMIN_ON_BOOT=true; otherwise fresh installs
  // use the browser Onboarding Wizard at /setup.
  if (process.env.SEED_ADMIN_ON_BOOT === 'true') {
    await AdminInitService.initializeAdminAccount();
  } else {
    console.log('✓ Onboarding wizard enabled for first-run admin setup (/setup)');
  }

  // Seed per-user taxonomy data (idempotent; covers existing users at every startup)
  const taxonomyService = new TaxonomyService();
  await taxonomyService.seedForAllUsers();
  console.log('✓ Taxonomy data seeded');

  const app = createApp();

  // Start server
  app.listen(config.port, config.host, () => {
    console.log(`✓ Server running on http://${config.host}:${config.port}`);
    console.log(`✓ Environment: ${config.env}`);
  });
}

bootstrap().catch((error) => {
  // Any startup failure (database, image storage, settings, ...) must
  // exit non-zero. Previously a failure here only hit the
  // `unhandledRejection` logger above and left the process hanging
  // without serving traffic — or worse, half-started.
  console.error('Fatal startup error:', error);
  process.exit(1);
});
