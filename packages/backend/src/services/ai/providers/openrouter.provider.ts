import axios from 'axios';
import { OpenAIProvider } from './openai.provider';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Documented default text/vision model for OpenRouter.
 *
 * Chosen to be vision-capable so recipe generation, pantry scan, and
 * recipe-from-photo all work out of the box with a single key. Model slugs on
 * OpenRouter shift over time — prefer picking from the discovered list in AI
 * Settings (Refresh models) rather than relying on this default forever.
 */
export const OPENROUTER_DEFAULT_TEXT_MODEL = 'openai/gpt-4o-mini';

/**
 * Documented default image model for OpenRouter's dedicated Images API
 * (POST /api/v1/images). Override per-instance via the image model field in
 * AI Settings; the live catalog is discoverable through listModels.
 */
export const OPENROUTER_DEFAULT_IMAGE_MODEL = 'google/gemini-2.5-flash-image';

// Optional app identification headers (OpenRouter analytics; no auth effect).
const APP_REFERER = 'https://github.com/mortegaux/nommable';
const APP_TITLE = 'Nommable';

/**
 * Heuristic list of model-id substrings that indicate image-input support.
 * OpenRouter model ids look like `vendor/slug`, so the OpenAI provider's
 * `includes('vision') || includes('4o')` check doesn't transfer. This is a
 * best-effort hint, not a capability contract — when unsure we fall back to
 * the documented default vision model and warn.
 */
const VISION_HINTS = [
  'vision',
  'gpt-4o',
  'gpt-4.1',
  'gemini',
  'claude',
  'qwen-vl',
  'qwen2-vl',
  'qwen3-vl',
  'pixtral',
  'llama-3.2',
  'llama-4',
  'mistral-small-3',
  'phi-4-multimodal',
  'idefics',
  'glm-4v',
];

function isProbablyVisionCapable(modelId: string): boolean {
  const m = modelId.toLowerCase();
  return VISION_HINTS.some((hint) => m.includes(hint));
}

function sniffImageMimeType(buffer: Buffer): string | undefined {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 6) {
    const head = buffer.toString('ascii', 0, 6);
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  }
  const textHead = buffer.toString('utf8', 0, 200).trimStart();
  if (textHead.startsWith('<svg')) return 'image/svg+xml';
  return undefined;
}

/**
 * OpenRouter AI provider (issue #61).
 *
 * One `sk-or-...` key covers text/vision AND image generation:
 * - Text/vision goes through the OpenAI-compatible `POST /api/v1/chat/completions`
 *   (inherited from OpenAIProvider, pointed at OpenRouter's base URL).
 * - Image generation uses OpenRouter's dedicated `POST /api/v1/images` endpoint,
 *   which is NOT OpenAI-compatible (no `/generations` suffix; images come back
 *   as `data[0].b64_json`), so it gets its own code path below.
 *
 * Billing stays entirely on the user's OpenRouter account — Nommable never
 * proxies or marks up; the key is sent straight to OpenRouter.
 */
export class OpenRouterProvider extends OpenAIProvider {
  private readonly apiKey: string;

  constructor(apiKey: string, model?: string) {
    super(apiKey, model, {
      baseURL: OPENROUTER_BASE_URL,
      defaultModel: OPENROUTER_DEFAULT_TEXT_MODEL,
    });
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': APP_REFERER,
      'X-Title': APP_TITLE,
    };
  }

  private extractErrorMessage(error: any): string | undefined {
    return (
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      error.message ||
      undefined
    );
  }

  /**
   * Free key check — GET /api/v1/auth/key spends no tokens and distinguishes
   * "bad key" (401) from "valid key, no credits" (which only surfaces on
   * actual inference calls as a 402).
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.get(`${OPENROUTER_BASE_URL}/auth/key`, {
        headers: this.headers(),
        timeout: 15000,
      });
      const label = response.data?.data?.label;
      return {
        success: true,
        message: `Connected to OpenRouter${label ? ` (key "${label}")` : ''} using model ${this.model}`,
      };
    } catch (error: any) {
      if (error.response?.status === 401) {
        return { success: false, message: 'Invalid OpenRouter API key' };
      }
      return {
        success: false,
        message: this.extractErrorMessage(error) || 'Failed to connect to OpenRouter',
      };
    }
  }

  protected override resolveVisionModel(): string {
    if (isProbablyVisionCapable(this.model)) {
      return this.model;
    }
    console.warn(
      `OpenRouter model "${this.model}" does not look vision-capable; falling back to ${OPENROUTER_DEFAULT_TEXT_MODEL} for image-input features.`
    );
    return OPENROUTER_DEFAULT_TEXT_MODEL;
  }

  /**
   * Image generation via OpenRouter's dedicated Images API.
   *
   * Unlike generateImage on the OpenAI provider, there is no cross-vendor
   * fallback list here: silently swapping to another vendor's model would
   * bill a different provider on the user's OpenRouter account without their
   * consent. A missing/unknown model surfaces as a clear, actionable error.
   */
  async generateImage(
    prompt: string,
    modelOverride?: string
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const model = (modelOverride && modelOverride.trim()) || OPENROUTER_DEFAULT_IMAGE_MODEL;

    let payload: any;
    try {
      const response = await axios.post(
        `${OPENROUTER_BASE_URL}/images`,
        { model, prompt },
        { headers: this.headers(), timeout: 120000 }
      );
      payload = response.data;
    } catch (error: any) {
      throw this.mapImageError(error, model);
    }

    const item = payload?.data?.[0];
    const b64 = item?.b64_json;
    if (typeof b64 !== 'string' || b64.length === 0) {
      throw new Error(
        `OpenRouter returned no image data for model "${model}". The model may not support image output.`
      );
    }

    const buffer = Buffer.from(b64, 'base64');
    return {
      buffer,
      mimeType: item.media_type || sniffImageMimeType(buffer) || 'image/png',
    };
  }

  private mapImageError(error: any, model: string): Error {
    const status = error.response?.status;
    const detail = this.extractErrorMessage(error);
    if (status === 401) {
      return new Error('Invalid OpenRouter API key. Check your key in AI Settings.');
    }
    if (status === 402) {
      return new Error(
        'Insufficient OpenRouter credits. Top up at openrouter.ai/credits — billing stays on your OpenRouter account.'
      );
    }
    if (status === 404) {
      return new Error(
        `Image model "${model}" not found on OpenRouter. Pick a model from the discovered list in AI Settings (Refresh models).`
      );
    }
    if (status === 429) {
      return new Error('OpenRouter rate limit reached. Wait a moment and try again.');
    }
    return new Error(`OpenRouter image generation failed: ${detail || `HTTP ${status ?? 'unknown'}`}`);
  }
}
