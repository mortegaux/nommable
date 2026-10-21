import request from 'supertest';
import { createApp } from '../../app';
import { SystemSettingsService } from '../../services/settings/system-settings.service';
import { EmailService } from '../../services/email/email.service';
import { config } from '../../config';
import { AppDataSource } from '../../db/data-source';
import { User } from '../../db/entities/User';
import { AIService } from '../../services/ai';
import { OpenAIProvider } from '../../services/ai/providers/openai.provider';

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

  it('managed status reports the managed mode', async () => {
    (config.ai.openai as { apiKey?: string }).apiKey = 'test-managed-key';

    const status = await request(app)
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(status.status).toBe(200);
    expect(status.body.mode).toBe('managed');
    expect(status.body.managed).toBe(true);
    expect(status.body.hasPersonalKey).toBe(false);
  });

  it('google-only env key: feature resolution passes the config gate (zero balance -> 402, not AI_NOT_CONFIGURED)', async () => {
    (config.ai.google as { apiKey?: string }).apiKey = 'test-google-key';

    const userRepo = AppDataSource.getRepository(User);
    const admin = await userRepo.findOne({ where: { username: 'aiadmin' } });
    await userRepo.update({ id: admin!.id }, { creditsRemaining: 0 });

    const res = await request(app)
      .post('/api/ai/substitute-ingredient')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ingredient: 'butter' });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('OUT_OF_CREDITS');
  });

  it('managed: a personal key can be saved and exempts the user from metering', async () => {
    (config.ai.openai as { apiKey?: string }).apiKey = 'test-managed-key';

    const put = await request(app)
      .put('/api/ai/my-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'google', apiKey: 'my-own-key' });
    expect(put.status).toBe(200);
    expect(put.body.mode).toBe('managed');
    expect(put.body.hasApiKey).toBe(true);

    const status = await request(app)
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(status.body.hasPersonalKey).toBe(true);
    expect(status.body.mode).toBe('managed');

    const userRepo = AppDataSource.getRepository(User);
    const admin = await userRepo.findOne({ where: { username: 'aiadmin' } });
    await userRepo.update({ id: admin!.id }, { creditsRemaining: 5 });
    await AIService.consumeManagedCredit(admin!.id);
    const after = await userRepo.findOne({ where: { id: admin!.id } });
    expect(after!.creditsRemaining).toBe(5);
  });

  it('managed: a provider failure surfaces as 502 AI_PROVIDER_ERROR with the provider message, not a generic 500', async () => {
    (config.ai.openai as { apiKey?: string }).apiKey = 'test-managed-key';
    const spy = jest
      .spyOn(OpenAIProvider.prototype, 'substituteIngredient')
      .mockRejectedValue(new Error('401 Incorrect API key provided'));
    try {
      const res = await request(app)
        .post('/api/ai/substitute-ingredient')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ingredient: 'butter' });
      expect(res.status).toBe(502);
      expect(res.body.code).toBe('AI_PROVIDER_ERROR');
      expect(res.body.error).toMatch(/Incorrect API key provided/);
    } finally {
      spy.mockRestore();
    }
  });

  it('managed: consumeManagedCredit charges a metered user exactly one credit', async () => {
    (config.ai.openai as { apiKey?: string }).apiKey = 'test-managed-key';

    const userRepo = AppDataSource.getRepository(User);
    const admin = await userRepo.findOne({ where: { username: 'aiadmin' } });
    await userRepo.update({ id: admin!.id }, { creditsRemaining: 5 });
    await AIService.consumeManagedCredit(admin!.id);
    const after = await userRepo.findOne({ where: { id: admin!.id } });
    expect(after!.creditsRemaining).toBe(4);
  });
});
