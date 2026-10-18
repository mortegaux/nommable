import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../../app';
import { createTestToken } from '../helpers/auth';
import { AppDataSource } from '../../db/data-source';
import { User } from '../../db/entities';
import { UserRole } from '@nommable/shared';
import { clearReleaseCache } from '../../services/system/system-status.service';

const app = createApp();

const ADMIN_ID = 'eeeeeeee-5555-5555-5555-000000000077';
const USER_ID = 'ffffffff-6666-6666-6666-000000000077';

async function createTestUser(id: string, role: UserRole): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  await userRepo
    .createQueryBuilder()
    .insert()
    .into(User)
    .values({
      id,
      email: `sys-test-${id.slice(0, 8)}@test.com`,
      username: `sys-user-${id.slice(0, 8)}`,
      role,
    })
    .orIgnore()
    .execute();
}

function mockReleaseFetch(tag: string) {
  return jest.fn(async () =>
    Promise.resolve({
      ok: true,
      json: async () => ({
        tag_name: tag,
        body: '## Changes\n- thing',
        html_url: `https://github.com/mortegaux/nommable/releases/tag/${tag}`,
        published_at: '2026-10-17T00:00:00Z',
      }),
    })
  ) as unknown as typeof fetch;
}

describe('GET /api/settings/system', () => {
  let adminToken: string;
  let userToken: string;

  beforeEach(() => {
    clearReleaseCache();
  });

  // Fixtures live in beforeEach, not beforeAll: the shared setup wipes
  // every table (including users + sessions) after each test.
  beforeEach(async () => {
    await createTestUser(ADMIN_ID, UserRole.ADMIN);
    await createTestUser(USER_ID, UserRole.USER);
    adminToken = createTestToken(ADMIN_ID);
    userToken = createTestToken(USER_ID);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 401 without a session', async () => {
    await request(app).get('/api/settings/system').expect(401);
  });

  it('returns 403 for a non-admin user', async () => {
    await request(app)
      .get('/api/settings/system')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('returns the full system status for an admin', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(mockReleaseFetch('v99.0.0'));
    const res = await request(app)
      .get('/api/settings/system')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Installed version is read from package.json at runtime, never hardcoded.
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'package.json'), 'utf8')
    ) as { version: string };
    expect(res.body.installedVersion).toBe(pkg.version);
    expect(res.body.available.status).toBe('update-available');
    expect(res.body.available.updateAvailable).toBe(true);
    expect(res.body.available.version).toBe('v99.0.0');
    expect(res.body.available.releaseNotes).toContain('## Changes');
    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(typeof res.body.database.path).toBe('string');
    expect(res.body.database.sizeBytes === null || typeof res.body.database.sizeBytes === 'number').toBe(true);
    expect(typeof res.body.uploads.path).toBe('string');
    expect(res.body.uploads.sizeBytes === null || typeof res.body.uploads.sizeBytes === 'number').toBe(true);
    // Backup/restore is issue #16 — honest empty state until then.
    expect(res.body.lastBackup).toEqual({ status: 'not-configured', at: null });
    expect(res.body.migrations.status).toBe('up-to-date');
    expect(res.body.migrations.pending).toBe(0);
  });

  it('still returns 200 with an unavailable update check when GitHub is unreachable', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const res = await request(app)
      .get('/api/settings/system')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.available.status).toBe('unavailable');
    expect(res.body.available.version).toBeNull();
    // The rest of the page still works.
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'package.json'), 'utf8')
    ) as { version: string };
    expect(res.body.installedVersion).toBe(pkg.version);
    expect(res.body.migrations.status).toBe('up-to-date');
  });
});
