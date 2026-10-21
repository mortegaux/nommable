import request from 'supertest';
import { createApp } from '../../app';
import { SystemSettingsService } from '../../services/settings/system-settings.service';
import { EmailService } from '../../services/email/email.service';
import { AppDataSource } from '../../db/data-source';
import { AIConfig } from '../../db/entities';
import { safeDecrypt } from '../../utils/crypto';
import { buildAnonymizedFeedbackPayload } from '../../api/controllers/feedback.controller';

const app = createApp();

describe('Onboarding Wizard (/api/setup) & Better Auth Session Flows', () => {
  beforeAll(async () => {
    await SystemSettingsService.initialize();
    await EmailService.initialize();
  });

  describe('First-Time Onboarding Wizard (/api/setup)', () => {
    it('returns needsSetup: true when no admin user exists', async () => {
      const res = await request(app).get('/api/setup/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ needsSetup: true, managedKeyDetected: expect.any(Boolean) });
    });

    it('rejects setup with password shorter than 8 characters', async () => {
      const res = await request(app)
        .post('/api/setup/complete')
        .send({
          admin: { username: 'admin', password: 'short' },
          library: { mode: 'shared' },
          ai: { enabled: false },
        });
      expect(res.status).toBe(400);
    });

    it('completes setup, creates admin, saves library & encrypted Gemini AI settings, and blocks re-runs with 403', async () => {
      const completeRes = await request(app)
        .post('/api/setup/complete')
        .send({
          admin: {
            username: 'chefadmin',
            password: 'supersecretpassword',
          },
          smtp: {
            skipped: true,
          },
          library: {
            mode: 'shared',
            sharedRecipes: true,
            showRecipeAuthor: true,
            sharedCollections: true,
            sharedMealPlans: false,
            sharedShoppingLists: true,
            sharedPantry: false,
            sharedBatchCooking: false,
          },
          ai: {
            enabled: true,
            geminiApiKey: 'AIzaSyTestGeminiKey123456',
            imageProvider: 'google',
            imageModel: 'gemini-2.0-flash',
          },
        });

      expect(completeRes.status).toBe(201);
      expect(completeRes.body.token).toBeTruthy();
      expect(completeRes.body.user.username).toBe('chefadmin');
      expect(completeRes.body.user.role).toBe('admin');

      // Status is now needsSetup: false
      const statusRes = await request(app).get('/api/setup/status');
      expect(statusRes.status).toBe(200);
      expect(statusRes.body).toEqual({ needsSetup: false, managedKeyDetected: expect.any(Boolean) });

      // Re-running setup returns 403 Forbidden
      const rerunRes = await request(app)
        .post('/api/setup/complete')
        .send({
          admin: { username: 'hacker', password: 'password12345' },
        });
      expect(rerunRes.status).toBe(403);

      // Verify library settings were persisted
      const settings = await SystemSettingsService.getSettings();
      expect(settings.sharedRecipes).toBe(true);
      expect(settings.sharedMealPlans).toBe(false);
      expect(settings.sharedShoppingLists).toBe(true);
      expect(settings.sharedPantry).toBe(false);

      // Verify Gemini key was stored encrypted at rest
      const aiRepo = AppDataSource.getRepository(AIConfig);
      const globalAi = await aiRepo.findOne({ where: { isGlobal: true } });
      expect(globalAi).toBeTruthy();
      expect(globalAi?.provider).toBe('google');
      expect(globalAi?.imageModel).toBe('gemini-2.0-flash');
      expect(globalAi?.apiKey).not.toBe('AIzaSyTestGeminiKey123456');
      expect(safeDecrypt(globalAi?.apiKey)).toBe('AIzaSyTestGeminiKey123456');
    });
  });

  describe('Better Auth Login, Bearer Session, Logout & Admin Role Gating', () => {
    it('authenticates via /api/auth/login, validates Bearer session on /api/auth/me, enforces admin role gating, and revokes on /api/auth/logout', async () => {
      // 1. Complete setup to create admin
      const setupRes = await request(app)
        .post('/api/setup/complete')
        .send({
          admin: { username: 'adminuser', password: 'adminpassword123' },
          smtp: { skipped: true },
          library: { mode: 'shared' },
          ai: { enabled: false },
        });
      expect(setupRes.status).toBe(201);

      // 2. Login via Better Auth
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'adminuser', password: 'adminpassword123' });
      expect(loginRes.status).toBe(200);
      const adminToken = loginRes.body.token;
      expect(adminToken).toBeTruthy();

      // 3. Invalid password returns 401
      const badLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'adminuser', password: 'wrongpassword' });
      expect(badLoginRes.status).toBe(401);

      // 4. Authenticated request to /api/auth/me succeeds
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.username).toBe('adminuser');
      expect(meRes.body.role).toBe('admin');

      // 5. Admin creates an invitation and a regular user registers via Better Auth
      const inviteRes = await request(app)
        .post('/api/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'member@example.com', role: 'user' });
      expect(inviteRes.status).toBe(201);
      const inviteToken = inviteRes.body.token || inviteRes.body.invitation?.token;
      expect(inviteToken).toBeTruthy();

      const registerRes = await request(app)
        .post('/api/auth/register/invite')
        .send({
          token: inviteToken,
          username: 'memberuser',
          password: 'memberpassword123',
        });
      expect(registerRes.status).toBe(201);
      const memberToken = registerRes.body.token;
      expect(memberToken).toBeTruthy();
      expect(registerRes.body.user.role).toBe('user');

      // 6. Regular user is blocked (403) from admin-only endpoints
      const forbiddenUsersRes = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(forbiddenUsersRes.status).toBe(403);

      // Admin user is allowed (200) on admin-only endpoints
      const allowedUsersRes = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(allowedUsersRes.status).toBe(200);
      expect(Array.isArray(allowedUsersRes.body.users || allowedUsersRes.body)).toBe(true);

      // 7. Feedback developer-forwarding opt-in defaults to false and only admin can toggle it
      const defaultGeneralRes = await request(app)
        .get('/api/settings/general')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(defaultGeneralRes.status).toBe(200);
      expect(defaultGeneralRes.body.shareAnonymousFeedback).toBe(false);

      const memberToggleRes = await request(app)
        .put('/api/settings/general')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ shareAnonymousFeedback: true });
      expect(memberToggleRes.status).toBe(403);

      const adminToggleRes = await request(app)
        .put('/api/settings/general')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ shareAnonymousFeedback: true });
      expect(adminToggleRes.status).toBe(200);
      expect(adminToggleRes.body.shareAnonymousFeedback).toBe(true);

      // Verify anonymized payload strips PII/extra fields
      const anonymized = buildAnonymizedFeedbackPayload({
        type: 'bug',
        summary: '  Timer sound does not play  ',
        details: '  Happens on mobile Safari  ',
        appVersion: '1.0.0',
        route: '/recipes/123',
        viewport: '390x844',
        userAgent: 'Mozilla/5.0',
        userId: 'secret-user-id',
        username: 'secretuser',
        email: 'user@example.com',
        recipes: [{ title: 'Secret family recipe' }],
      });
      expect(anonymized).toEqual({
        type: 'bug',
        summary: 'Timer sound does not play',
        details: 'Happens on mobile Safari',
        appVersion: '1.0.0',
        route: '/recipes/123',
        viewport: '390x844',
        userAgent: 'Mozilla/5.0',
      });
      expect('userId' in anonymized).toBe(false);
      expect('username' in anonymized).toBe(false);
      expect('email' in anonymized).toBe(false);
      expect('recipes' in anonymized).toBe(false);

      // 8. Logout revokes the Better Auth session token
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(logoutRes.status).toBe(200);

      const afterLogoutRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(afterLogoutRes.status).toBe(401);
    });
  });
});
