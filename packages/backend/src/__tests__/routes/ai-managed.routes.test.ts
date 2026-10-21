import request from 'supertest';
import { createApp } from '../../app';
import { SystemSettingsService } from '../../services/settings/system-settings.service';
import { EmailService } from '../../services/email/email.service';
import { config } from '../../config';

const app = createApp();

/**
 * Managed-instance AI settings: when the server environment carries an
 * operator AI key and no admin-saved global config exists, the instance
 * is "managed" — GET /ai/config reports the managed state (not a 404),
 * /ai/status reports AI as configured, and creating a key config is
 * rejected so a saved key cannot silently override the managed key.
 * The managed state is toggled here by mutating the imported config
 * object, which AIService reads live on each call.
 */
describe('Managed instance AI settings (/api/ai)', () => {
  const ENV_KEYS = ['openai', 'anthropic', 'google', 'openrouter'] as const;
  const savedKeys: Record<string, string | undefined> = {};
  let adminToken = '';

  function clearEnvKeys() {
    for (const p of ENV_KEYS) {
      (config.ai[p] as { apiKey?: string }).apiKey = undefined;
    }
  }

  beforeAll(async () => {
    await SystemSettingsService.initialize();
    await EmailService.initialize();
    for (const p of ENV_KEYS) {
      savedKeys[p] = (config.ai[p] as { apiKey?: string }).apiKey;
    }
  });

  afterAll(() => {
    for (const p of ENV_KEYS) {
      (config.ai[p] as { apiKey?: string }).apiKey = savedKeys[p];
    }
  });

  beforeEach(async () => {
    clearEnvKeys();
    const res = await request(app)
      .post('/api/setup/complete')
      .send({
        admin: { username: 'aiadmin', password: 'password123' },
        smtp: { skipped: true },
        library: { mode: 'shared' },
        ai: { enabled: false },
      });
    expect(res.status).toBe(201);
    adminToken = res.body.token;
    expect(adminToken).toBeTruthy();
  });

  it('without env keys or a saved config: config 404s and status is unconfigured', async () => {
    const cfg = await request(app)
      .get('/api/ai/config')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(cfg.status).toBe(404);

    const status = await request(app)
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(status.status).toBe(200);
    expect(status.body.isConfigured).toBe(false);
    expect(status.body.managed).toBe(false);
  });

  it('with an operator env key and no saved config: reports the managed state', async () => {
    (config.ai.openai as { apiKey?: string }).apiKey = 'test-managed-key';

    const cfg = await request(app)
      .get('/api/ai/config')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(cfg.status).toBe(200);
    expect(cfg.body.managed).toBe(true);
    expect(cfg.body.envProviders).toEqual(['openai']);
    expect(cfg.body.hasApiKey).toBe(false);

    const status = await request(app)
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      isConfigured: true,
      isEnabled: true,
      provider: 'openai',
      managed: true,
    });
  });

  it('rejects creating a key config while managed', async () => {
    (config.ai.openai as { apiKey?: string }).apiKey = 'test-managed-key';

    const res = await request(app)
      .post('/api/ai/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'openai', apiKey: 'sk-admin-key', aiMode: 'shared' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Managed AI/);
  });
});
