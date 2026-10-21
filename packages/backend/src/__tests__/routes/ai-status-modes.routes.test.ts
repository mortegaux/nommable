import request from 'supertest';
import { createApp } from '../../app';
import { SystemSettingsService } from '../../services/settings/system-settings.service';
import { EmailService } from '../../services/email/email.service';

const app = createApp();

/**
 * /ai/status must reflect the CALLER's effective readiness in every mode:
 * - shared: the admin's global key configures everyone;
 * - per-user: only the caller's own enabled key counts — the global row
 *   alone must not report a keyless user as configured.
 * Personal keys stay rejected in shared mode.
 */
describe('AI status per mode (/api/ai)', () => {
  let adminToken = '';

  beforeAll(async () => {
    await SystemSettingsService.initialize();
    await EmailService.initialize();
  });

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/setup/complete')
      .send({
        admin: { username: 'statusadmin', password: 'password123' },
        smtp: { skipped: true },
        library: { mode: 'shared' },
        ai: { enabled: false },
      });
    expect(res.status).toBe(201);
    adminToken = res.body.token;
    expect(adminToken).toBeTruthy();
  });

  it('shared mode: status follows the global config; personal keys are rejected', async () => {
    const save = await request(app)
      .post('/api/ai/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        provider: 'google',
        apiKey: 'shared-key',
        model: 'gemini-2.0-flash',
        aiMode: 'shared',
        enabled: true,
      });
    expect(save.status).toBe(201);

    const status = await request(app)
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(status.body.isConfigured).toBe(true);
    expect(status.body.mode).toBe('shared');
    expect(status.body.managed).toBe(false);

    const put = await request(app)
      .put('/api/ai/my-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'google', apiKey: 'mine' });
    expect(put.status).toBe(403);
  });

  it('setup status reports whether a managed master key is detectable', async () => {
    const res = await request(app).get('/api/setup/status');
    expect(res.status).toBe(200);
    expect(typeof res.body.managedKeyDetected).toBe('boolean');
  });

  it('per-user mode: a keyless caller is NOT configured until they save a key', async () => {
    const save = await request(app)
      .post('/api/ai/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        provider: 'google',
        apiKey: 'instance-key',
        model: 'gemini-2.0-flash',
        aiMode: 'per-user',
        enabled: true,
      });
    expect(save.status).toBe(201);

    const before = await request(app)
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(before.body.mode).toBe('per-user');
    expect(before.body.isConfigured).toBe(false);
    expect(before.body.hasPersonalKey).toBe(false);

    const put = await request(app)
      .put('/api/ai/my-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'google', apiKey: 'mine' });
    expect(put.status).toBe(200);

    const after = await request(app)
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(after.body.isConfigured).toBe(true);
    expect(after.body.hasPersonalKey).toBe(true);
  });
});
