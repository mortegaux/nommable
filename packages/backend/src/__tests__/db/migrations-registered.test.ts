import { readdirSync } from 'fs';
import { join } from 'path';
import { AppDataSource } from '../../db/data-source';

/**
 * Guard: every migration file in src/db/migrations must be registered
 * in AppDataSource, and vice versa. An unregistered migration silently
 * never runs — that is how AddCreditsRemaining shipped unregistered on
 * 2026-10-20: fresh installs had no users.credits_remaining column and
 * the setup wizard's final step failed with a generic 500
 * ("no such column: User.credits_remaining").
 */
describe('migration registration', () => {
  it('every migration file is registered in AppDataSource', () => {
    const migrationsDir = join(__dirname, '../../db/migrations');
    const expected = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
      .map((f) => {
        // File names are "<timestamp>-<Name>.ts"; the migration's
        // recorded name is "<Name><timestamp>".
        const base = f.replace(/\.ts$/, '');
        const dash = base.indexOf('-');
        const timestamp = base.slice(0, dash);
        const name = base.slice(dash + 1);
        return `${name}${timestamp}`;
      })
      .sort();
    const registered = AppDataSource.migrations.map((m) => m.name).sort();
    expect(registered).toEqual(expected);
  });
});
