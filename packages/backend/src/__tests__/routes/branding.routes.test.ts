import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../app';
import { createTestToken } from '../helpers/auth';
import { AppDataSource } from '../../db/data-source';
import { User } from '../../db/entities';
import { UserRole } from '@nommable/shared';
import { BrandingService } from '../../services/settings/branding.service';

const app = createApp();

// 1x1 transparent PNG (valid magic bytes for the content check).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function createTestUser(id: string, role: UserRole): Promise<string> {
  const userRepo = AppDataSource.getRepository(User);
  await userRepo
    .createQueryBuilder()
    .insert()
    .into(User)
    .values({
      id,
      email: `branding-test-${id.slice(0, 8)}@test.com`,
      username: `branding-user-${id.slice(0, 8)}`,
      role,
    })
    .orIgnore()
    .execute();
  return createTestToken(id);
}

async function adminToken(): Promise<string> {
  return createTestUser(crypto.randomUUID(), UserRole.ADMIN);
}

async function userToken(): Promise<string> {
  return createTestUser(crypto.randomUUID(), UserRole.USER);
}

describe('Instance branding (/api/settings/branding)', () => {
  beforeEach(async () => {
    // branding_settings is raw SQL, not a TypeORM entity, so the global
    // test setup does not clean it — reset explicitly between tests.
    await BrandingService.resetBranding();
  });

  describe('GET /api/settings/branding (public)', () => {
    it('returns defaults without authentication', async () => {
      const res = await request(app).get('/api/settings/branding').expect(200);
      expect(res.body).toEqual({
        appName: null,
        logoUrl: null,
        accentColor: null,
        faviconUrl: null,
      });
    });

    it('returns customized branding without authentication', async () => {
      const admin = await adminToken();
      await request(app)
        .put('/api/settings/branding')
        .set('Authorization', `Bearer ${admin}`)
        .send({ appName: 'My Kitchen', accentColor: '#C2410C' })
        .expect(200);

      const res = await request(app).get('/api/settings/branding').expect(200);
      expect(res.body.appName).toBe('My Kitchen');
      expect(res.body.accentColor).toBe('#C2410C');
    });
  });

  describe('PUT /api/settings/branding (admin-only)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      await request(app).put('/api/settings/branding').send({ appName: 'X' }).expect(401);
    });

    it('rejects non-admin users with 403', async () => {
      const token = await userToken();
      await request(app)
        .put('/api/settings/branding')
        .set('Authorization', `Bearer ${token}`)
        .send({ appName: 'X' })
        .expect(403);
    });

    it('persists a valid name + accent for admins', async () => {
      const admin = await adminToken();
      const res = await request(app)
        .put('/api/settings/branding')
        .set('Authorization', `Bearer ${admin}`)
        .send({ appName: 'My Kitchen', accentColor: '#166534' })
        .expect(200);
      expect(res.body.appName).toBe('My Kitchen');
      expect(res.body.accentColor).toBe('#166534');

      // Survives a fresh read (server-side persistence, not localStorage).
      const reread = await request(app).get('/api/settings/branding').expect(200);
      expect(reread.body.appName).toBe('My Kitchen');
    });

    it('normalizes accent hex to uppercase', async () => {
      const admin = await adminToken();
      const res = await request(app)
        .put('/api/settings/branding')
        .set('Authorization', `Bearer ${admin}`)
        .send({ accentColor: '#c2410c' })
        .expect(200);
      expect(res.body.accentColor).toBe('#C2410C');
    });

    it('rejects malformed accent colors', async () => {
      const admin = await adminToken();
      for (const bad of ['red', '#12345', '#GGGGGG', 'C2410C', 123]) {
        await request(app)
          .put('/api/settings/branding')
          .set('Authorization', `Bearer ${admin}`)
          .send({ accentColor: bad })
          .expect(400);
      }
    });

    it('rejects accents too light to keep primary text readable', async () => {
      const admin = await adminToken();
      // Very light yellow: ~1.1:1 against white — primary text would vanish.
      await request(app)
        .put('/api/settings/branding')
        .set('Authorization', `Bearer ${admin}`)
        .send({ accentColor: '#FEF08A' })
        .expect(400);
    });

    it('rejects names with markup or over the length limit', async () => {
      const admin = await adminToken();
      await request(app)
        .put('/api/settings/branding')
        .set('Authorization', `Bearer ${admin}`)
        .send({ appName: '<script>alert(1)</script>' })
        .expect(400);
      await request(app)
        .put('/api/settings/branding')
        .set('Authorization', `Bearer ${admin}`)
        .send({ appName: 'x'.repeat(101) })
        .expect(400);
      await request(app)
        .put('/api/settings/branding')
        .set('Authorization', `Bearer ${admin}`)
        .send({ appName: '   ' })
        .expect(400);
    });

    it('explicit null clears a field back to the default', async () => {
      const admin = await adminToken();
      await request(app)
        .put('/api/settings/branding')
        .set('Authorization', `Bearer ${admin}`)
        .send({ appName: 'My Kitchen', accentColor: '#C2410C' })
        .expect(200);
      const res = await request(app)
        .put('/api/settings/branding')
        .set('Authorization', `Bearer ${admin}`)
        .send({ appName: null, accentColor: null })
        .expect(200);
      expect(res.body.appName).toBeNull();
      expect(res.body.accentColor).toBeNull();
    });
  });

  describe('POST /api/settings/branding/logo (admin-only upload)', () => {
    it('rejects unauthenticated and non-admin uploads', async () => {
      await request(app)
        .post('/api/settings/branding/logo')
        .attach('logo', PNG_1X1, { filename: 'logo.png', contentType: 'image/png' })
        .expect(401);
      const token = await userToken();
      await request(app)
        .post('/api/settings/branding/logo')
        .set('Authorization', `Bearer ${token}`)
        .attach('logo', PNG_1X1, { filename: 'logo.png', contentType: 'image/png' })
        .expect(403);
    });

    it('accepts a valid PNG and returns its public URL', async () => {
      const admin = await adminToken();
      const res = await request(app)
        .post('/api/settings/branding/logo')
        .set('Authorization', `Bearer ${admin}`)
        .attach('logo', PNG_1X1, { filename: 'logo.png', contentType: 'image/png' })
        .expect(200);
      expect(res.body.logoUrl).toMatch(/^\/uploads\/branding\/logo-[^/]+\.png$/);
    });

    it('rejects content that is not really an image (spoofed PNG)', async () => {
      const admin = await adminToken();
      await request(app)
        .post('/api/settings/branding/logo')
        .set('Authorization', `Bearer ${admin}`)
        .attach('logo', Buffer.from('<svg onload=alert(1)>'), {
          filename: 'evil.png',
          contentType: 'image/png',
        })
        .expect(400);
    });

    it('rejects disallowed MIME types (SVG is a stored-XSS vector)', async () => {
      const admin = await adminToken();
      await request(app)
        .post('/api/settings/branding/logo')
        .set('Authorization', `Bearer ${admin}`)
        .attach('logo', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), {
          filename: 'logo.svg',
          contentType: 'image/svg+xml',
        })
        .expect(400);
    });

    it('DELETE removes the logo and falls back to the default', async () => {
      const admin = await adminToken();
      await request(app)
        .post('/api/settings/branding/logo')
        .set('Authorization', `Bearer ${admin}`)
        .attach('logo', PNG_1X1, { filename: 'logo.png', contentType: 'image/png' })
        .expect(200);
      const res = await request(app)
        .delete('/api/settings/branding/logo')
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);
      expect(res.body.logoUrl).toBeNull();
    });
  });

  describe('POST /api/settings/branding/favicon', () => {
    it('accepts a valid favicon upload and DELETE removes it', async () => {
      const admin = await adminToken();
      const uploaded = await request(app)
        .post('/api/settings/branding/favicon')
        .set('Authorization', `Bearer ${admin}`)
        .attach('favicon', PNG_1X1, { filename: 'fav.png', contentType: 'image/png' })
        .expect(200);
      expect(uploaded.body.faviconUrl).toMatch(/^\/uploads\/branding\/favicon-[^/]+\.png$/);
      const removed = await request(app)
        .delete('/api/settings/branding/favicon')
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);
      expect(removed.body.faviconUrl).toBeNull();
    });
  });

  describe('POST /api/settings/branding/reset', () => {
    it('restores stock branding for admins and rejects non-admins', async () => {
      const admin = await adminToken();
      await request(app)
        .put('/api/settings/branding')
        .set('Authorization', `Bearer ${admin}`)
        .send({ appName: 'My Kitchen', accentColor: '#C2410C' })
        .expect(200);
      await request(app)
        .post('/api/settings/branding/logo')
        .set('Authorization', `Bearer ${admin}`)
        .attach('logo', PNG_1X1, { filename: 'logo.png', contentType: 'image/png' })
        .expect(200);

      const user = await userToken();
      await request(app)
        .post('/api/settings/branding/reset')
        .set('Authorization', `Bearer ${user}`)
        .expect(403);

      const res = await request(app)
        .post('/api/settings/branding/reset')
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);
      expect(res.body).toEqual({
        appName: null,
        logoUrl: null,
        accentColor: null,
        faviconUrl: null,
      });
    });
  });
});
