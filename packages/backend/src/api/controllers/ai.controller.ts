import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware';
import { AppDataSource } from '../../db/data-source';
import { AIConfig } from '../../db/entities';
import { AIService, sendAIUnavailable } from '../../services/ai';
import { AppError } from '../middleware';
import { encrypt, safeDecrypt } from '../../utils/crypto';
import { AIMode } from '@nommable/shared';

const AI_MODES: AIMode[] = ['shared', 'per-user'];
const USER_PROVIDERS = ['openai', 'anthropic', 'google', 'ollama', 'openrouter'];

function maskKey(encrypted?: string | null): string | null {
  const key = safeDecrypt(encrypted);
  if (!key) return null;
  return `••••${key.slice(-4)}`;
}

export class AIController {
  // ---------- Instance-wide config (admin only) ----------

  async getConfig(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const aiConfigRepo = AppDataSource.getRepository(AIConfig);
      const config = await aiConfigRepo.findOne({ where: { isGlobal: true } });

      if (!config) {
        // Managed instance: no admin-saved config, but AI is provided by
        // the operator's env keys. Report the managed state instead of a
        // 404 so the settings UI shows that state rather than a key form
        // whose saved config would silently override the managed key.
        if (await AIService.isManagedInstance()) {
          return res.json({
            managed: true,
            envProviders: AIService.getManagedEnvProviders(),
            provider: null,
            model: null,
            imageModel: null,
            baseUrl: null,
            enabled: true,
            aiMode: 'shared',
            hasApiKey: false,
            hasImageApiKey: false,
          });
        }
        return res.status(404).json({ error: 'AI configuration not found' });
      }

      // Don't send API key to client
      res.json({
        id: config.id,
        provider: config.provider,
        model: config.model,
        imageModel: config.imageModel,
        baseUrl: config.baseUrl,
        enabled: config.enabled,
        aiMode: config.aiMode ?? 'shared',
        hasApiKey: !!config.apiKey,
        hasImageApiKey: !!config.imageApiKey,
        managed: false,
      });
    } catch (error) {
      next(error);
    }
  }

  async createConfig(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // On a managed instance the operator's env key is the AI source;
      // an admin-saved config would silently override it, so key settings
      // are not accepted here.
      if (await AIService.isManagedInstance()) {
        throw new AppError(
          403,
          'This instance uses Managed AI provided by the operator, so site-wide and per-user API keys are disabled. AI key settings are controlled through the server environment.'
        );
      }

      const { provider, apiKey, model, imageModel, imageApiKey, baseUrl, enabled, aiMode } = req.body;

      if (aiMode !== undefined && !AI_MODES.includes(aiMode)) {
        throw new AppError(400, `aiMode must be one of: ${AI_MODES.join(', ')}`);
      }

      const aiConfigRepo = AppDataSource.getRepository(AIConfig);

      // Check if the global config already exists
      const existing = await aiConfigRepo.findOne({ where: { isGlobal: true } });

      if (existing) {
        throw new AppError(409, 'AI configuration already exists. Use PUT to update.');
      }

      const config = aiConfigRepo.create({
        userId: req.userId!,
        isGlobal: true,
        aiMode: aiMode ?? 'shared',
        provider,
        apiKey: apiKey ? encrypt(apiKey) : undefined,
        model: model ? model.trim() : undefined,
        imageModel: imageModel ? imageModel.trim() : undefined,
        imageApiKey: imageApiKey ? encrypt(imageApiKey) : undefined,
        baseUrl: baseUrl ? baseUrl.trim() : undefined,
        enabled: enabled ?? true,
      });

      await aiConfigRepo.save(config);

      // Clear cache
      AIService.clearCache();

      res.status(201).json({
        id: config.id,
        provider: config.provider,
        model: config.model,
        imageModel: config.imageModel,
        baseUrl: config.baseUrl,
        enabled: config.enabled,
        aiMode: config.aiMode,
        hasApiKey: !!config.apiKey,
        hasImageApiKey: !!config.imageApiKey,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateConfig(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const aiConfigRepo = AppDataSource.getRepository(AIConfig);
      const config = await aiConfigRepo.findOne({ where: { isGlobal: true } });

      if (!config) {
        throw new AppError(404, 'AI configuration not found');
      }

      const { provider, apiKey, model, imageModel, imageApiKey, baseUrl, enabled, aiMode } = req.body;

      // Update key distribution mode
      if (aiMode !== undefined) {
        if (!AI_MODES.includes(aiMode)) {
          throw new AppError(400, `aiMode must be one of: ${AI_MODES.join(', ')}`);
        }
        config.aiMode = aiMode;
      }

      // Update provider
      if (provider !== undefined) {
        config.provider = provider;
      }

      // Update API key (only if provided, empty string means keep existing)
      if (apiKey !== undefined && apiKey !== '') {
        config.apiKey = encrypt(apiKey);
      }

      // Update imageApiKey (if provided, empty string clears it, undefined keeps existing)
      if (imageApiKey !== undefined) {
        config.imageApiKey = imageApiKey ? encrypt(imageApiKey) : undefined;
      }

      // Update model (allow empty string to clear it, null/undefined means keep existing)
      if (model !== undefined) {
        config.model = model ? model.trim() : undefined;
      }

      // Update imageModel (allow empty string to clear it, null/undefined means keep existing)
      if (imageModel !== undefined) {
        config.imageModel = imageModel ? imageModel.trim() : undefined;
      }

      // Update baseUrl (allow empty string to clear it, null/undefined means keep existing)
      if (baseUrl !== undefined) {
        config.baseUrl = baseUrl ? baseUrl.trim() : undefined;
      }

      // Update enabled flag
      if (enabled !== undefined) {
        config.enabled = enabled;
      }

      await aiConfigRepo.save(config);

      // Clear cache to force reload of provider (mode may have changed)
      AIService.clearCache();

      res.json({
        id: config.id,
        provider: config.provider,
        model: config.model,
        imageModel: config.imageModel,
        baseUrl: config.baseUrl,
        enabled: config.enabled,
        aiMode: config.aiMode,
        hasApiKey: !!config.apiKey,
        hasImageApiKey: !!config.imageApiKey,
      });
    } catch (error) {
      next(error);
    }
  }

  async testConnection(req: AuthRequest, res: Response, _next: NextFunction) {
    try {
      const { provider, apiKey, model, baseUrl } = req.body || {};
      const result = await AIService.testConnection({
        provider,
        apiKey,
        model,
        baseUrl,
      });
      res.json(result);
    } catch (error: any) {
      console.error('Error in AIController.testConnection:', error);
      res.json({
        success: false,
        message: error.message || 'Failed to test AI connection',
      });
    }
  }

  async getStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const mode = await AIService.getAIMode();
      const userConfig = req.userId ? await AIService.getUserConfig(req.userId) : null;
      const hasPersonalKey = !!userConfig?.enabled;

      if (mode === 'managed') {
        // Managed instance: AI works via the operator's env keys (or the
        // caller's own key when they saved one) even though no config row
        // exists — report it as configured so AI features light up.
        const envProviders = AIService.getManagedEnvProviders();
        return res.json({
          isConfigured: true,
          isEnabled: true,
          provider: hasPersonalKey ? (userConfig?.provider ?? null) : (envProviders[0] ?? null),
          mode,
          managed: true,
          hasPersonalKey,
        });
      }

      if (mode === 'per-user') {
        // Readiness is per user in this mode: the global row alone does not
        // mean THIS caller can use AI — only their own enabled key does.
        return res.json({
          isConfigured: hasPersonalKey,
          isEnabled: hasPersonalKey,
          provider: userConfig?.provider ?? null,
          mode,
          managed: false,
          hasPersonalKey,
        });
      }

      const aiConfigRepo = AppDataSource.getRepository(AIConfig);
      const config = await aiConfigRepo.findOne({ where: { isGlobal: true } });
      res.json({
        isConfigured: !!config?.enabled,
        isEnabled: !!config?.enabled,
        provider: config?.provider ?? null,
        mode,
        managed: false,
        hasPersonalKey,
      });
    } catch (error) {
      next(error);
    }
  }

  async listModels(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const provider = ((req.query.provider as string) || req.body?.provider) as any;
      const apiKey = req.body?.apiKey;
      const baseUrl = (req.query.baseUrl as string) || req.body?.baseUrl;
      const refresh = req.query.refresh === 'true' || req.body?.refresh === true;
      const type = ((req.query.type as string) || req.body?.type) as 'text' | 'image' | undefined;

      if (!provider) {
        return res.status(400).json({ error: 'Provider is required' });
      }

      const models = await AIService.listModels({
        provider,
        apiKey,
        baseUrl,
        refresh,
        type,
      });

      res.json({ models });
    } catch (error) {
      next(error);
    }
  }

  async substituteIngredient(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resolution = await AIService.resolveProvider(req.userId);

      if (!resolution.ok) {
        return sendAIUnavailable(res, resolution);
      }

      const { ingredient, reason, recipeContext } = req.body;

      const substitutions = await resolution.provider.substituteIngredient(ingredient, reason, recipeContext);

      await AIService.consumeManagedCredit(req.userId);
      res.json({ substitutions });
    } catch (error) {
      next(error);
    }
  }

  // ---------- Per-user (BYOK) key management (any authenticated user) ----------

  /**
   * Get the caller's own AI key status. Never returns the full key — only a masked
   * suffix — and never exposes the instance shared key.
   */
  async getMyConfig(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const mode = await AIService.getAIMode();
      const aiConfigRepo = AppDataSource.getRepository(AIConfig);
      const config = await aiConfigRepo.findOne({ where: { userId: req.userId!, isGlobal: false } });

      res.json({
        mode,
        provider: config?.provider ?? null,
        enabled: config?.enabled ?? true,
        hasApiKey: !!config?.apiKey,
        maskedKey: maskKey(config?.apiKey),
        baseUrl: config?.baseUrl ?? null,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Save (create or update) the caller's own AI key. The key is encrypted at rest
   * with the existing encryption util. Rejected only in shared mode; allowed
   * in per-user mode and on managed instances (where a personal key takes
   * over from the operator's key and is never credit-metered).
   */
  async saveMyConfig(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const mode = await AIService.getAIMode();
      if (mode === 'shared') {
        throw new AppError(
          403,
          'Personal AI keys are disabled on this instance: it uses the shared AI key configured by your admin.'
        );
      }

      const { provider, apiKey, baseUrl, enabled } = req.body ?? {};

      if (!USER_PROVIDERS.includes(provider)) {
        throw new AppError(400, `Provider must be one of: ${USER_PROVIDERS.join(', ')}`);
      }

      const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
      const trimmedBaseUrl = typeof baseUrl === 'string' ? baseUrl.trim() : '';

      if (provider !== 'ollama' && !trimmedKey) {
        throw new AppError(400, 'An API key is required for this provider.');
      }
      if (provider === 'ollama' && !trimmedBaseUrl) {
        throw new AppError(400, 'A base URL is required for Ollama.');
      }

      const aiConfigRepo = AppDataSource.getRepository(AIConfig);
      let config = await aiConfigRepo.findOne({ where: { userId: req.userId!, isGlobal: false } });

      if (!config) {
        config = aiConfigRepo.create({
          userId: req.userId!,
          isGlobal: false,
          provider,
          enabled: enabled ?? true,
        });
      }

      config.provider = provider;

      // Only overwrite the stored key when a new one is provided (empty = keep existing)
      if (trimmedKey) {
        config.apiKey = encrypt(trimmedKey);
      }

      // Base URL (Ollama); empty string clears it
      config.baseUrl = trimmedBaseUrl ? trimmedBaseUrl : undefined;

      if (enabled !== undefined) {
        config.enabled = !!enabled;
      }

      await aiConfigRepo.save(config);

      // Drop this user's cached provider so the new key takes effect immediately
      AIService.clearCache(req.userId);

      res.json({
        mode,
        provider: config.provider,
        enabled: config.enabled,
        hasApiKey: !!config.apiKey,
        maskedKey: maskKey(config.apiKey),
        baseUrl: config.baseUrl ?? null,
      });
    } catch (error) {
      next(error);
    }
  }

  /** Delete the caller's own AI key. */
  async deleteMyConfig(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const mode = await AIService.getAIMode();
      if (mode === 'shared') {
        throw new AppError(
          403,
          'Personal AI keys are disabled on this instance: it uses the shared AI key configured by your admin.'
        );
      }

      const aiConfigRepo = AppDataSource.getRepository(AIConfig);
      await aiConfigRepo.delete({ userId: req.userId!, isGlobal: false });

      AIService.clearCache(req.userId);

      res.json({ deleted: true });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Test the caller's personal key: uses the key/base URL from the request body,
   * falling back to the saved personal key when the fields are left blank.
   * Never touches the instance shared key.
   */
  async testMyConfig(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const mode = await AIService.getAIMode();
      if (mode === 'shared') {
        throw new AppError(
          403,
          'Personal AI keys are disabled on this instance: it uses the shared AI key configured by your admin.'
        );
      }

      const { provider, apiKey, baseUrl } = req.body ?? {};

      if (!USER_PROVIDERS.includes(provider)) {
        throw new AppError(400, `Provider must be one of: ${USER_PROVIDERS.join(', ')}`);
      }

      const aiConfigRepo = AppDataSource.getRepository(AIConfig);
      const saved = await aiConfigRepo.findOne({ where: { userId: req.userId!, isGlobal: false } });

      const effectiveKey =
        (typeof apiKey === 'string' && apiKey.trim()) || safeDecrypt(saved?.apiKey) || undefined;
      const effectiveBaseUrl =
        (typeof baseUrl === 'string' && baseUrl.trim()) || saved?.baseUrl || undefined;

      if (provider !== 'ollama' && !effectiveKey) {
        return res.json({ success: false, message: 'Enter an API key to test the connection.' });
      }

      const result = await AIService.testConnection({
        provider,
        apiKey: effectiveKey,
        baseUrl: effectiveBaseUrl,
      });
      res.json(result);
    } catch (error: any) {
      console.error('Error in AIController.testMyConfig:', error);
      next(error);
    }
  }
}
