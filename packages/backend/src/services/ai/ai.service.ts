import axios from 'axios';
import OpenAI from 'openai';
import { AIProvider, AIModelInfo, AIGeneratedRecipe, AIMode } from '@nommable/shared';
import type { Response } from 'express';
import { AppDataSource } from '../../db/data-source';
import { AppError } from '../../api/middleware/error-handler';
import { AIConfig } from '../../db/entities';
import { Recipe } from '../../db/entities/Recipe';
import { config } from '../../config';
import { safeDecrypt } from '../../utils/crypto';
import { parseRecipeFromTextHeuristic, normalizeRawRecipeJson } from '../../utils/recipe-text-parser';
import { ImageStorageService } from '../image-storage.service';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GoogleProvider } from './providers/google.provider';
import { OllamaProvider } from './providers/ollama.provider';
import {
  OpenRouterProvider,
  OPENROUTER_BASE_URL,
  OPENROUTER_DEFAULT_TEXT_MODEL,
  OPENROUTER_DEFAULT_IMAGE_MODEL,
} from './providers/openrouter.provider';
import { IAIProvider } from './types';

/**
 * Key distribution mode for this instance (stored on the global ai_configs row).
 * - 'shared': every user uses the admin-configured global key (default, legacy behavior).
 * - 'per-user': each user supplies their own key via Settings -> AI Key. There is NO
 *   fallback to the global key; users without a key get a friendly 403 on AI endpoints.
 */
export const AI_KEY_REQUIRED_CODE = 'AI_KEY_REQUIRED';
export const AI_KEY_REQUIRED_MESSAGE =
  'AI is not configured for your account. Add your API key in Settings to enable AI features.';

export interface AIResolutionFailure {
  mode: AIMode;
  reason: 'no-user-key' | 'not-configured';
}

export type AIProviderResolution =
  | { ok: true; provider: IAIProvider; mode: AIMode }
  | ({ ok: false } & AIResolutionFailure);

/**
 * Send the standard "AI unavailable" response for an endpoint.
 * Per-user mode without a personal key -> 403 with a machine-readable code so the
 * frontend can render an inline "add your API key" prompt instead of a raw error.
 */
export function sendAIUnavailable(res: Response, failure: AIResolutionFailure): Response {
  if (failure.reason === 'no-user-key') {
    return res.status(403).json({ error: AI_KEY_REQUIRED_MESSAGE, code: AI_KEY_REQUIRED_CODE });
  }
  return res.status(400).json({ error: 'AI provider not configured', code: 'AI_NOT_CONFIGURED' });
}

export class AIService {
  private static providerCache: Map<string, IAIProvider> = new Map();
  private static modelCache: Map<string, { timestamp: number; models: AIModelInfo[] }> = new Map();
  private static readonly MODEL_CACHE_TTL = 60 * 60 * 1000; // 1 hour

  /** Read the instance key mode from the global AI config row (defaults to 'shared'). */
  static async getAIMode(): Promise<AIMode> {
    const globalConfig = await this.getGlobalConfig();
    return globalConfig?.aiMode === 'per-user' ? 'per-user' : 'shared';
  }

  /** The single admin-managed, instance-wide AI config (isGlobal = true). */
  static async getGlobalConfig(): Promise<AIConfig | null> {
    const aiConfigRepo = AppDataSource.getRepository(AIConfig);
    return aiConfigRepo.findOne({ where: { isGlobal: true } });
  }

  /** A user's own BYOK config row (isGlobal = false), if they saved one. */
  static async getUserConfig(userId: string): Promise<AIConfig | null> {
    const aiConfigRepo = AppDataSource.getRepository(AIConfig);
    return aiConfigRepo.findOne({ where: { userId, isGlobal: false } });
  }

  /**
   * Resolve the AI provider for a requesting user.
   * - shared mode: the admin-configured global key, for everyone (legacy behavior).
   * - per-user mode: the user's own enabled key only. No fallback to the global key;
   *   users without a key get null (callers should 403 via resolveProvider()).
   */
  static async getProvider(userId?: string): Promise<IAIProvider | null> {
    const mode = await this.getAIMode();
    const aiConfigRepo = AppDataSource.getRepository(AIConfig);

    if (mode === 'per-user') {
      if (!userId) {
        return null;
      }
      // Check cache first
      const cacheKey = `user:${userId}`;
      if (this.providerCache.has(cacheKey)) {
        return this.providerCache.get(cacheKey)!;
      }

      const aiConfig = await aiConfigRepo.findOne({
        where: { userId, isGlobal: false, enabled: true },
      });

      if (!aiConfig) {
        return null;
      }

      const provider = this.createProvider(aiConfig, mode);
      if (provider) {
        this.providerCache.set(cacheKey, provider);
      }

      return provider;
    }

    // Shared mode: the admin-configured global key for everyone (legacy behavior).
    // Check cache first
    const cacheKey = 'shared';
    if (this.providerCache.has(cacheKey)) {
      return this.providerCache.get(cacheKey)!;
    }

    const aiConfig = await aiConfigRepo.findOne({
      where: { isGlobal: true, enabled: true },
    });

    if (!aiConfig) {
      return null;
    }

    const provider = this.createProvider(aiConfig, mode);
    if (provider) {
      this.providerCache.set(cacheKey, provider);
    }

    return provider;
  }

  /**
   * Resolve a provider for an endpoint, distinguishing "user needs to add a key"
   * from "nothing configured". Pair with sendAIUnavailable() in controllers.
   */
  static async resolveProvider(userId?: string): Promise<AIProviderResolution> {
    const mode = await this.getAIMode();
    const provider = await this.getProvider(userId);
    if (provider) {
      return { ok: true, provider, mode };
    }
    if (mode === 'per-user') {
      return { ok: false, mode, reason: 'no-user-key' };
    }
    return { ok: false, mode, reason: 'not-configured' };
  }

  static createProviderInstance(
    provider: AIProvider,
    apiKey?: string,
    model?: string,
    baseUrl?: string
  ): IAIProvider | null {
    switch (provider) {
      case 'openai': {
        const openaiKey = apiKey || config.ai.openai.apiKey;
        if (!openaiKey) return null;
        return new OpenAIProvider(openaiKey, model || undefined);
      }

      case 'anthropic': {
        const anthropicKey = apiKey || config.ai.anthropic.apiKey;
        if (!anthropicKey) return null;
        return new AnthropicProvider(anthropicKey, model || undefined);
      }

      case 'google': {
        const googleKey = apiKey || config.ai.google.apiKey;
        if (!googleKey) return null;
        return new GoogleProvider(googleKey, model || undefined);
      }

      case 'ollama': {
        const ollamaUrl = baseUrl || config.ai.ollama.baseUrl || 'http://localhost:11434';
        return new OllamaProvider(ollamaUrl, model || undefined);
      }

      case 'openrouter': {
        const openrouterKey = apiKey || config.ai.openrouter.apiKey;
        if (!openrouterKey) return null;
        return new OpenRouterProvider(openrouterKey, model || undefined);
      }

      default:
        return null;
    }
  }

  private static createProvider(aiConfig: AIConfig, mode: AIMode): IAIProvider | null {
    const provider = aiConfig.provider as AIProvider;
    const apiKey = safeDecrypt(aiConfig.apiKey);
    if (mode === 'per-user' && provider !== 'ollama' && !apiKey) {
      // In per-user mode never fall back to instance-level env keys.
      return null;
    }
    return this.createProviderInstance(
      provider,
      apiKey,
      aiConfig.model || undefined,
      aiConfig.baseUrl || undefined
    );
  }

  static clearCache(userId?: string) {
    if (userId) {
      this.providerCache.delete(`user:${userId}`);
    } else {
      this.providerCache.clear();
    }
  }

  static async testConnection(options?: {
    provider?: AIProvider;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      // If testing with specific options (e.g. from the settings form)
      if (options?.provider && options.provider !== 'none') {
        const aiConfigRepo = AppDataSource.getRepository(AIConfig);
        const savedConfig = await aiConfigRepo.findOne({ where: { isGlobal: true } });

        const resolvedApiKey =
          (options.apiKey && options.apiKey.trim()) ||
          safeDecrypt(savedConfig?.apiKey) ||
          (options.provider === 'openai'
            ? config.ai.openai.apiKey
            : options.provider === 'anthropic'
            ? config.ai.anthropic.apiKey
            : options.provider === 'google'
            ? config.ai.google.apiKey
            : options.provider === 'openrouter'
            ? config.ai.openrouter.apiKey
            : undefined);

        const resolvedBaseUrl =
          (options.baseUrl && options.baseUrl.trim()) ||
          savedConfig?.baseUrl ||
          (options.provider === 'ollama' ? config.ai.ollama.baseUrl : undefined) ||
          'http://localhost:11434';

        const resolvedModel =
          (options.model && options.model.trim()) ||
          savedConfig?.model ||
          undefined;

        const provider = this.createProviderInstance(
          options.provider,
          resolvedApiKey,
          resolvedModel,
          resolvedBaseUrl
        );

        if (!provider) {
          if (options.provider === 'ollama') {
            return {
              success: false,
              message: 'Ollama base URL is missing or invalid.',
            };
          }
          return {
            success: false,
            message: `No API key provided for ${options.provider}. Please enter your API key or save your settings.`,
          };
        }

        try {
          return await provider.testConnection();
        } catch (error: any) {
          return {
            success: false,
            message: error.message || 'Failed to test connection',
          };
        }
      }

      // No explicit options: test the admin-configured global key (admin panel).
      const globalConfig = await this.getGlobalConfig();
      const provider =
        globalConfig && globalConfig.enabled ? this.createProvider(globalConfig, 'shared') : null;

      if (!provider) {
        return {
          success: false,
          message: 'No AI provider configured. Please configure an AI provider in settings.',
        };
      }

      try {
        return await provider.testConnection();
      } catch (error: any) {
        return {
          success: false,
          message: error.message || 'Failed to test connection',
        };
      }
    } catch (err: any) {
      console.error('AIService.testConnection top-level error:', err);
      return {
        success: false,
        message: err.message || 'Failed to test AI connection',
      };
    }
  }

  static async listModels(
    providerOrOptions:
      | AIProvider
      | {
          provider: AIProvider;
          apiKey?: string;
          baseUrl?: string;
          refresh?: boolean;
          type?: 'text' | 'image';
        },
    maybeOptions?: {
      apiKey?: string;
      baseUrl?: string;
      refresh?: boolean;
      type?: 'text' | 'image';
    }
  ): Promise<AIModelInfo[]> {
    const provider =
      typeof providerOrOptions === 'string'
        ? providerOrOptions
        : providerOrOptions.provider;
    const options =
      typeof providerOrOptions === 'string' ? maybeOptions : providerOrOptions;

    if (provider === 'none') {
      return [];
    }

    if (options?.type === 'image') {
      if (provider === 'google') {
        return [
          {
            id: 'gemini-2.0-flash',
            name: 'Gemini 2.0 Flash (Multimodal)',
            description: 'Google Gemini 2.0 - Fast multimodal image generation',
            isDefault: true,
          },
          {
            id: 'imagen-3.0-generate-002',
            name: 'Imagen 3 (High Quality)',
            description: 'Google Imagen 3 - Highest visual quality (requires Google Cloud billing)',
          },
          {
            id: 'imagen-3.0-fast-generate-001',
            name: 'Imagen 3 Fast',
            description: 'Google Imagen 3 Fast - Lower latency (requires Google Cloud billing)',
          },
        ];
      }
      if (provider === 'openai') {
        return [
          {
            id: 'gpt-image-1.5',
            name: 'GPT-Image 1.5',
            description: 'OpenAI GPT-Image 1.5 - High-quality, photorealistic food photography (recommended)',
            isDefault: true,
          },
          {
            id: 'gpt-image-2.5-sunburst',
            name: 'GPT-Image 2.5 Sunburst',
            description: 'OpenAI GPT-Image 2.5 - Flagship visual quality and lighting',
          },
          {
            id: 'gpt-image-1',
            name: 'GPT-Image 1',
            description: 'OpenAI GPT-Image 1 - Fast multimodal image generation',
          },
          {
            id: 'dall-e-3',
            name: 'DALL-E 3 (Legacy)',
            description: 'OpenAI DALL-E 3 - Legacy model',
          },
          {
            id: 'dall-e-2',
            name: 'DALL-E 2 (Legacy)',
            description: 'OpenAI DALL-E 2 - Legacy model',
          },
        ];
      }
      if (provider === 'openrouter') {
        return this.fetchOpenRouterImageModels(options?.apiKey, options?.refresh);
      }
      return [];
    }

    const refresh = options?.refresh ?? false;

    // Load active config if custom options not passed (admin panel -> global row)
    const aiConfigRepo = AppDataSource.getRepository(AIConfig);
    const savedConfig = await aiConfigRepo.findOne({ where: { isGlobal: true } });

    const apiKey =
      options?.apiKey ||
      safeDecrypt(savedConfig?.apiKey) ||
      (provider === 'openai'
        ? config.ai.openai.apiKey
        : provider === 'anthropic'
        ? config.ai.anthropic.apiKey
        : provider === 'google'
        ? config.ai.google.apiKey
        : provider === 'openrouter'
        ? config.ai.openrouter.apiKey
        : undefined);

    const baseUrl =
      options?.baseUrl ||
      savedConfig?.baseUrl ||
      (provider === 'ollama' ? config.ai.ollama.baseUrl : undefined) ||
      'http://localhost:11434';

    const cacheKey = `${provider}:${apiKey ? apiKey.slice(-6) : baseUrl}`;

    if (!refresh && this.modelCache.has(cacheKey)) {
      const cached = this.modelCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < this.MODEL_CACHE_TTL) {
        return cached.models;
      }
    }

    let models: AIModelInfo[] = [];

    switch (provider) {
      case 'openai':
        models = await this.fetchOpenAIModels(apiKey);
        break;
      case 'anthropic':
        models = await this.fetchAnthropicModels(apiKey);
        break;
      case 'google':
        models = await this.fetchGoogleModels(apiKey);
        break;
      case 'ollama':
        models = await this.fetchOllamaModels(baseUrl);
        break;
      case 'openrouter':
        models = await this.fetchOpenRouterModels(apiKey);
        break;
    }

    if (models.length > 0) {
      this.modelCache.set(cacheKey, { timestamp: Date.now(), models });
    }

    return models;
  }

  private static async fetchOpenAIModels(apiKey?: string): Promise<AIModelInfo[]> {
    const defaultModels: AIModelInfo[] = [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Flagship omni model - fast and highly capable', isDefault: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast, lightweight and cost-effective' },
      { id: 'o1', name: 'o1', description: 'Advanced reasoning model for complex tasks' },
      { id: 'o1-mini', name: 'o1 Mini', description: 'Fast reasoning model' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'High-capability model' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Legacy fast model' },
    ];

    if (!apiKey) return defaultModels;

    try {
      const client = new OpenAI({ apiKey });
      const response: any = await client.models.list();
      const rawList: any[] = Array.isArray(response?.data) ? response.data : [];
      const chatModels: AIModelInfo[] = rawList
        .filter((m: any) => {
          const id = (m?.id || '').toLowerCase();
          return (
            (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('chatgpt-')) &&
            !id.includes('instruct') &&
            !id.includes('realtime') &&
            !id.includes('audio') &&
            !id.includes('transcribe') &&
            !id.includes('tts')
          );
        })
        .map((m: any) => ({
          id: m.id,
          name: m.id,
          isDefault: m.id === 'gpt-4o',
        }));

      const priority = ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
      chatModels.sort((a, b) => {
        const aIndex = priority.indexOf(a.id);
        const bIndex = priority.indexOf(b.id);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.id.localeCompare(b.id);
      });

      return chatModels.length > 0 ? chatModels : defaultModels;
    } catch (err) {
      console.warn('Failed to fetch live OpenAI models, returning defaults:', (err as any)?.message);
      return defaultModels;
    }
  }

  private static async fetchAnthropicModels(apiKey?: string): Promise<AIModelInfo[]> {
    const defaultModels: AIModelInfo[] = [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Most intelligent model, balanced speed and reasoning', isDefault: true },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fastest, most responsive model' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'High capability for complex analysis' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', description: 'Legacy balanced model' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Legacy fast model' },
    ];

    if (!apiKey) return defaultModels;

    try {
      const response = await axios.get('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: 8000,
      });

      if (response.data?.data && Array.isArray(response.data.data)) {
        const models = response.data.data
          .filter((m: any) => m.id.startsWith('claude-'))
          .map((m: any) => ({
            id: m.id,
            name: m.display_name || m.id,
            isDefault: m.id.includes('claude-3-5-sonnet'),
          }));
        if (models.length > 0) return models;
      }
    } catch (err) {
      console.warn('Failed to fetch live Anthropic models, returning defaults:', (err as any)?.message);
    }
    return defaultModels;
  }

  private static async fetchGoogleModels(apiKey?: string): Promise<AIModelInfo[]> {
    const defaultModels: AIModelInfo[] = [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Recommended - fast, high quality, and cost-efficient', isDefault: true },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Advanced reasoning and complex multimodal understanding' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Second-generation multimodal flash model' },
      { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro', description: 'Standard text model' },
    ];

    if (!apiKey) return defaultModels;

    try {
      const response = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { timeout: 8000 }
      );

      if (response.data?.models && Array.isArray(response.data.models)) {
        const models = response.data.models
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => {
            const id = m.name.replace(/^models\//, '');
            return {
              id,
              name: m.displayName || id,
              description: m.description,
              isDefault: id === 'gemini-1.5-flash',
            };
          })
          .filter((m: any) => !m.id.includes('embedding') && !m.id.includes('aqa'));

        if (models.length > 0) {
          const priority = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-1.0-pro'];
          models.sort((a: any, b: any) => {
            const aIdx = priority.indexOf(a.id);
            const bIdx = priority.indexOf(b.id);
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            return a.id.localeCompare(b.id);
          });
          return models;
        }
      }
    } catch (err) {
      console.warn('Failed to fetch live Google models, returning defaults:', (err as any)?.message);
    }
    return defaultModels;
  }

  private static async fetchOllamaModels(baseUrl: string): Promise<AIModelInfo[]> {
    const defaultModels: AIModelInfo[] = [
      { id: 'llama3.2', name: 'Llama 3.2', description: 'Meta lightweight model', isDefault: true },
      { id: 'llama3.1', name: 'Llama 3.1', description: 'Meta powerful open model' },
      { id: 'mistral', name: 'Mistral 7B', description: 'Fast, efficient general purpose model' },
      { id: 'gemma2', name: 'Gemma 2', description: 'Google open weights model' },
      { id: 'phi3', name: 'Phi-3', description: 'Microsoft compact model' },
      { id: 'llama2', name: 'Llama 2', description: 'Legacy Meta model' },
    ];

    try {
      const response = await axios.get(`${baseUrl}/api/tags`, { timeout: 5000 });
      if (response.data?.models && Array.isArray(response.data.models)) {
        const models = response.data.models.map((m: any) => {
          const sizeGB = m.size ? ` (${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB)` : '';
          return {
            id: m.name,
            name: m.name,
            description: `Installed locally${sizeGB}`,
            isDefault: m.name.includes('llama3') || m.name.includes('llama2'),
          };
        });
        if (models.length > 0) return models;
      }
    } catch (err) {
      console.warn(`Failed to reach Ollama at ${baseUrl}, returning defaults:`, (err as any)?.message);
    }
    return defaultModels;
  }

  private static openRouterHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/mortegaux/nommable',
      'X-Title': 'Nommable',
    };
  }

  /**
   * Discover OpenRouter text/chat models via GET /api/v1/models.
   *
   * Per issue #61 we do not hardcode the catalog: models are discovered live
   * and vision-capable ones (image input) are annotated so the UI can steer
   * users toward a model that also serves pantry scan / recipe-from-photo.
   * Without a key (or when discovery fails) we return a small documented
   * defaults list instead of an empty picker.
   */
  private static async fetchOpenRouterModels(apiKey?: string): Promise<AIModelInfo[]> {
    const defaultModels: AIModelInfo[] = [
      {
        id: OPENROUTER_DEFAULT_TEXT_MODEL,
        name: 'GPT-4o Mini (via OpenRouter)',
        description: 'Fast, affordable, vision-capable — recommended default',
        isDefault: true,
      },
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o (via OpenRouter)',
        description: 'Flagship omni model, vision-capable',
      },
      {
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash (via OpenRouter)',
        description: 'Fast multimodal model, vision-capable',
      },
      {
        id: 'anthropic/claude-sonnet-4',
        name: 'Claude Sonnet 4 (via OpenRouter)',
        description: 'Strong reasoning, vision-capable',
      },
    ];

    if (!apiKey) return defaultModels;

    try {
      const response = await axios.get(`${OPENROUTER_BASE_URL}/models`, {
        headers: this.openRouterHeaders(apiKey),
        timeout: 10000,
      });

      const rawList: any[] = Array.isArray(response.data?.data) ? response.data.data : [];
      const models: AIModelInfo[] = rawList
        .filter((m: any) => {
          const out = m?.architecture?.output_modalities;
          // Keep text-output models; entries without architecture info are kept
          // (older catalog entries) rather than dropped.
          return !Array.isArray(out) || out.includes('text');
        })
        .map((m: any) => {
          const id = String(m?.id || '');
          const input = m?.architecture?.input_modalities;
          const vision = Array.isArray(input) && input.includes('image');
          const desc = typeof m?.description === 'string' ? m.description.slice(0, 140) : '';
          return {
            id,
            name: (typeof m?.name === 'string' && m.name) || id,
            description: `${vision ? '[Vision] ' : ''}${desc}`.trim(),
            isDefault: id === OPENROUTER_DEFAULT_TEXT_MODEL,
          };
        })
        .filter((m: AIModelInfo) => m.id);

      if (models.length > 0) {
        // Default first, then vision-capable, then alphabetical.
        models.sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (b.isDefault && !a.isDefault) return 1;
          const aVision = a.description?.startsWith('[Vision]') ? 0 : 1;
          const bVision = b.description?.startsWith('[Vision]') ? 0 : 1;
          if (aVision !== bVision) return aVision - bVision;
          return a.id.localeCompare(b.id);
        });
        return models;
      }
    } catch (err) {
      console.warn('Failed to fetch live OpenRouter models, returning defaults:', (err as any)?.message);
    }
    return defaultModels;
  }

  /**
   * Discover OpenRouter image models via GET /api/v1/images/models — the
   * dedicated Images API catalog (not the OpenAI-compatible /models list).
   * Cached for an hour like the text catalog.
   */
  private static async fetchOpenRouterImageModels(
    apiKey?: string,
    refresh = false
  ): Promise<AIModelInfo[]> {
    const defaultModels: AIModelInfo[] = [
      {
        id: OPENROUTER_DEFAULT_IMAGE_MODEL,
        name: 'Gemini 2.5 Flash Image (via OpenRouter)',
        description: 'Fast, affordable image generation — recommended default',
        isDefault: true,
      },
    ];

    if (!apiKey) return defaultModels;

    const cacheKey = `openrouter:image:${apiKey.slice(-6)}`;
    if (!refresh && this.modelCache.has(cacheKey)) {
      const cached = this.modelCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < this.MODEL_CACHE_TTL) {
        return cached.models;
      }
    }

    try {
      const response = await axios.get(`${OPENROUTER_BASE_URL}/images/models`, {
        headers: this.openRouterHeaders(apiKey),
        timeout: 10000,
      });

      const rawList: any[] = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
        ? response.data
        : [];
      const models: AIModelInfo[] = rawList
        .map((m: any) => {
          const id = String(m?.id || '');
          const desc = typeof m?.description === 'string' ? m.description.slice(0, 140) : '';
          return {
            id,
            name: (typeof m?.name === 'string' && m.name) || id,
            description: desc,
            isDefault: id === OPENROUTER_DEFAULT_IMAGE_MODEL,
          };
        })
        .filter((m: AIModelInfo) => m.id);

      if (models.length > 0) {
        models.sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (b.isDefault && !a.isDefault) return 1;
          return a.id.localeCompare(b.id);
        });
        this.modelCache.set(cacheKey, { timestamp: Date.now(), models });
        return models;
      }
    } catch (err) {
      console.warn('Failed to fetch live OpenRouter image models, returning defaults:', (err as any)?.message);
    }
    return defaultModels;
  }

  static async generateImage(
    prompt: string,
    modelOverride?: string,
    userId?: string
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const mode = await this.getAIMode();
    const savedConfig =
      mode === 'per-user' && userId ? await this.getUserConfig(userId) : await this.getGlobalConfig();

    if (mode === 'per-user' && (!savedConfig || !savedConfig.enabled)) {
      throw new AppError(403, AI_KEY_REQUIRED_MESSAGE);
    }

    const effectiveImageModel =
      (modelOverride && modelOverride.trim()) ||
      (savedConfig?.imageModel && savedConfig.imageModel.trim()) ||
      undefined;

    const isExplicitOpenAI =
      effectiveImageModel?.toLowerCase().startsWith('dall-e') ||
      effectiveImageModel?.toLowerCase().startsWith('gpt-image');
    const isExplicitGoogle =
      effectiveImageModel?.toLowerCase().startsWith('imagen') ||
      effectiveImageModel?.toLowerCase().startsWith('gemini');
    // OpenRouter model ids look like `vendor/slug` (e.g. `google/gemini-2.5-flash-image`).
    const isExplicitOpenRouter =
      !!effectiveImageModel && effectiveImageModel.includes('/');

    const provider = await this.getProvider(userId);

    // 1. If active provider supports image generation and doesn't conflict with explicit model
    if (provider && typeof provider.generateImage === 'function') {
      // NB: OpenRouterProvider extends OpenAIProvider — check it first.
      const isProviderOpenRouter = provider instanceof OpenRouterProvider;
      const isProviderOpenAI = provider instanceof OpenAIProvider && !isProviderOpenRouter;
      const isProviderGoogle = provider instanceof GoogleProvider;

      if (
        (!isExplicitOpenAI && !isExplicitGoogle && !isExplicitOpenRouter) ||
        (isExplicitOpenAI && isProviderOpenAI) ||
        (isExplicitGoogle && isProviderGoogle) ||
        (isExplicitOpenRouter && isProviderOpenRouter)
      ) {
        return await provider.generateImage(prompt, effectiveImageModel);
      }
    }

    // 2. Otherwise direct to OpenAI or Google based on explicit model or saved/env config
    const savedKey = safeDecrypt(savedConfig?.apiKey);
    const imageKey = safeDecrypt(savedConfig?.imageApiKey);

    // In per-user mode only the user's own key may be used — never instance env keys.
    const instanceKeysAllowed = mode === 'shared';

    if (isExplicitOpenAI || (!isExplicitGoogle && !isExplicitOpenRouter && savedConfig?.provider === 'openai')) {
      const openaiKey =
        imageKey ||
        (savedConfig?.provider === 'openai' ? savedKey : undefined) ||
        (instanceKeysAllowed ? config.ai.openai.apiKey : undefined);
      if (openaiKey) {
        const openaiProvider = new OpenAIProvider(openaiKey);
        return await openaiProvider.generateImage(prompt, effectiveImageModel);
      }
    }

    // OpenRouter: explicit `vendor/slug` image model, or OpenRouter is the configured provider.
    if (isExplicitOpenRouter || savedConfig?.provider === 'openrouter') {
      const openrouterKey =
        imageKey ||
        (savedConfig?.provider === 'openrouter' ? savedKey : undefined) ||
        (instanceKeysAllowed ? config.ai.openrouter.apiKey : undefined);
      if (openrouterKey) {
        const openrouterProvider = new OpenRouterProvider(openrouterKey);
        return await openrouterProvider.generateImage(prompt, effectiveImageModel);
      }
    }

    const googleKey =
      (savedConfig?.provider === 'google' ? savedKey : undefined) ||
      imageKey ||
      (instanceKeysAllowed ? config.ai.google.apiKey : undefined);
    if (googleKey && !isExplicitOpenRouter) {
      const googleProvider = new GoogleProvider(googleKey);
      return await googleProvider.generateImage(prompt, effectiveImageModel);
    }

    const openaiKeyFallback =
      imageKey ||
      (savedConfig?.provider === 'openai' ? savedKey : undefined) ||
      (instanceKeysAllowed ? config.ai.openai.apiKey : undefined);
    if (openaiKeyFallback && !isExplicitOpenRouter) {
      const openaiProvider = new OpenAIProvider(openaiKeyFallback);
      return await openaiProvider.generateImage(prompt, effectiveImageModel);
    }

    throw new Error(
      'Image generation requires Google AI (Gemini/Imagen), OpenAI (DALL-E/GPT-Image), or OpenRouter. Please configure one of them in AI Settings.'
    );
  }

  static buildRecipeImagePrompt(options: {
    title?: string;
    description?: string;
    cuisine?: string;
    customPrompt?: string;
  }): string {
    if (options.customPrompt && options.customPrompt.trim()) {
      return options.customPrompt.trim();
    }

    const parts: string[] = [];
    const dish = options.title || 'delicious culinary dish';
    parts.push(`A stunning, appetizing professional culinary photo of ${dish}.`);

    if (options.description) {
      parts.push(options.description.slice(0, 150));
    }

    if (options.cuisine) {
      parts.push(`Authentic ${options.cuisine} cuisine style.`);
    }

    parts.push(
      'Plated beautifully on high-end tableware, restaurant-quality presentation, garnished thoughtfully, natural warm lighting, close-up food photography, 8k resolution, photorealistic, sharp focus.'
    );

    return parts.join(' ');
  }

  static async generateAndSaveRecipeImage(options: {
    recipeId?: string;
    title?: string;
    description?: string;
    cuisine?: string;
    customPrompt?: string;
    model?: string;
    userId?: string;
  }): Promise<{ imageUrl: string; recipe?: any }> {
    let recipeRecord: Recipe | null = null;
    if (options.recipeId) {
      const { SystemSettingsService } = await import('../settings/system-settings.service');
      const sharedRecipes = await SystemSettingsService.isSharedRecipesEnabled();
      const recipeRepo = AppDataSource.getRepository(Recipe);
      recipeRecord = await recipeRepo.findOne({
        where: !sharedRecipes && options.userId
          ? { id: options.recipeId, userId: options.userId }
          : { id: options.recipeId },
        relations: { ingredients: true },
      });
    }

    const effectiveTitle = options.title || recipeRecord?.title || 'delicious food dish';
    const effectiveDescription = options.description || recipeRecord?.description;
    const effectiveCuisine = options.cuisine || recipeRecord?.categories?.[0];

    const prompt = this.buildRecipeImagePrompt({
      title: effectiveTitle,
      description: effectiveDescription,
      cuisine: effectiveCuisine,
      customPrompt: options.customPrompt,
    });

    const { buffer, mimeType } = await this.generateImage(prompt, options.model, options.userId);

    // Save in the exact same storage directory (/uploads/recipes) and PostgreSQL backup
    // as all other uploaded recipe images
    const { imageUrl } = await ImageStorageService.saveImageBuffer(
      'recipes',
      buffer,
      mimeType,
      'recipe'
    );

    let updatedRecipe: Recipe | undefined = undefined;
    if (recipeRecord) {
      const recipeRepo = AppDataSource.getRepository(Recipe);
      await recipeRepo.update({ id: recipeRecord.id }, { imageUrl });
      recipeRecord.imageUrl = imageUrl;
      updatedRecipe = recipeRecord;
    }

    return { imageUrl, recipe: updatedRecipe };
  }

  static async extractRecipeFromText(rawText: string, userId?: string): Promise<AIGeneratedRecipe> {
    const trimmed = rawText.trim();

    // 1. If user pasted valid JSON, normalize it directly
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        const recipeObj = Array.isArray(parsed) ? parsed[0] : parsed;
        if (recipeObj && (recipeObj.title || recipeObj.name)) {
          return normalizeRawRecipeJson(recipeObj);
        }
      } catch {
        // Not valid JSON, continue to text extraction
      }
    }

    // 2. If AI provider is configured, use AI extraction first
    // (falls back to the heuristic parser below when unavailable — no 403 here)
    try {
      const provider = await this.getProvider(userId);
      if (provider && typeof provider.extractRecipeFromText === 'function') {
        const extracted = await provider.extractRecipeFromText(trimmed);
        if (
          extracted &&
          extracted.title &&
          ((Array.isArray(extracted.ingredients) && extracted.ingredients.length > 0) ||
            (Array.isArray(extracted.instructions) && extracted.instructions.length > 0))
        ) {
          return extracted;
        }
      }
    } catch (aiErr: any) {
      console.warn(
        'AI recipe text extraction failed, falling back to heuristic parser:',
        aiErr?.message || aiErr
      );
    }

    // 3. Fallback to intelligent heuristic text parser
    return parseRecipeFromTextHeuristic(trimmed);
  }
}
