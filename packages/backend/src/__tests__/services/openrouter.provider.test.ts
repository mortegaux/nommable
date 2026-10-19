/**
 * Tests for the OpenRouter AI provider (issue #61).
 *
 * All HTTP is mocked — no test touches openrouter.ai or any real endpoint
 * (SSRF rule: mocks/local only).
 */
import axios from 'axios';
import OpenAI from 'openai';
import { AIService } from '../../services/ai/ai.service';
import {
  OpenRouterProvider,
  OPENROUTER_BASE_URL,
  OPENROUTER_DEFAULT_TEXT_MODEL,
  OPENROUTER_DEFAULT_IMAGE_MODEL,
} from '../../services/ai/providers/openrouter.provider';
import { OpenAIProvider } from '../../services/ai/providers/openai.provider';

jest.mock('axios');
jest.mock('openai');

const mockedAxios = axios as unknown as {
  get: jest.Mock;
  post: jest.Mock;
};
const MockedOpenAI = OpenAI as unknown as jest.Mock;

const pngBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(100, 0),
]);
const jpegBytes = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.alloc(100, 0),
]);

describe('OpenRouterProvider', () => {
  let capturedClientOptions: any;
  let mockChatCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedClientOptions = undefined;
    mockChatCreate = jest.fn();
    MockedOpenAI.mockImplementation((opts: any) => {
      capturedClientOptions = opts;
      return { chat: { completions: { create: mockChatCreate } } };
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.warn as jest.Mock).mockRestore();
  });

  describe('construction and text path', () => {
    it('points the OpenAI-compatible client at the OpenRouter base URL', () => {
      new OpenRouterProvider('sk-or-test-key');
      expect(MockedOpenAI).toHaveBeenCalled();
      expect(capturedClientOptions.apiKey).toBe('sk-or-test-key');
      expect(capturedClientOptions.baseURL).toBe(OPENROUTER_BASE_URL);
      expect(OPENROUTER_BASE_URL).toBe('https://openrouter.ai/api/v1');
    });

    it('defaults to the documented vision-capable text model', () => {
      const provider = new OpenRouterProvider('sk-or-test-key');
      expect((provider as any).model).toBe(OPENROUTER_DEFAULT_TEXT_MODEL);
      expect(OPENROUTER_DEFAULT_TEXT_MODEL).toBe('openai/gpt-4o-mini');
    });

    it('honors an explicit model override', () => {
      const provider = new OpenRouterProvider('sk-or-test-key', 'anthropic/claude-sonnet-4');
      expect((provider as any).model).toBe('anthropic/claude-sonnet-4');
    });

    it('sends recipe generation through the OpenRouter-routed client', async () => {
      const recipe = { title: 'Test', ingredients: [], instructions: [] };
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(recipe) } }],
      });

      const provider = new OpenRouterProvider('sk-or-test-key');
      const result = await provider.generateRecipe('pasta');

      expect(mockChatCreate).toHaveBeenCalledTimes(1);
      const args = mockChatCreate.mock.calls[0][0];
      expect(args.model).toBe(OPENROUTER_DEFAULT_TEXT_MODEL);
      expect(result.title).toBe('Test');
    });
  });

  describe('testConnection', () => {
    it('uses the free /auth/key check and reports the key label', async () => {
      mockedAxios.get.mockResolvedValue({ data: { data: { label: 'test-key' } } });
      const provider = new OpenRouterProvider('sk-or-test-key');
      const result = await provider.testConnection();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${OPENROUTER_BASE_URL}/auth/key`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer sk-or-test-key' }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.message).toContain('test-key');
    });

    it('maps 401 to an invalid-key message', async () => {
      mockedAxios.get.mockRejectedValue({ response: { status: 401 } });
      const provider = new OpenRouterProvider('sk-or-bad');
      const result = await provider.testConnection();
      expect(result).toEqual({ success: false, message: 'Invalid OpenRouter API key' });
    });
  });

  describe('vision model resolution', () => {
    it('keeps a vision-capable configured model for image-input calls', () => {
      const provider = new OpenRouterProvider('sk-or-test-key', 'google/gemini-2.5-flash');
      expect((provider as any).resolveVisionModel()).toBe('google/gemini-2.5-flash');
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('falls back to the documented default for text-only models', () => {
      const provider = new OpenRouterProvider('sk-or-test-key', 'deepseek/deepseek-chat');
      expect((provider as any).resolveVisionModel()).toBe(OPENROUTER_DEFAULT_TEXT_MODEL);
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('generateImage (dedicated Images API)', () => {
    it('posts to /api/v1/images and decodes data[0].b64_json', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { data: [{ b64_json: pngBytes.toString('base64'), media_type: 'image/png' }] },
      });

      const provider = new OpenRouterProvider('sk-or-test-key');
      const result = await provider.generateImage('a bowl of ramen');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${OPENROUTER_BASE_URL}/images`,
        { model: OPENROUTER_DEFAULT_IMAGE_MODEL, prompt: 'a bowl of ramen' },
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer sk-or-test-key' }),
        })
      );
      expect(result.buffer.equals(pngBytes)).toBe(true);
      expect(result.mimeType).toBe('image/png');
    });

    it('sniffs the mime type from magic bytes when media_type is omitted', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { data: [{ b64_json: jpegBytes.toString('base64') }] },
      });

      const provider = new OpenRouterProvider('sk-or-test-key');
      const result = await provider.generateImage('a bowl of ramen', 'black-forest-labs/flux-2-dev');
      expect(mockedAxios.post.mock.calls[0][1].model).toBe('black-forest-labs/flux-2-dev');
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('throws a clear error when no image data comes back', async () => {
      mockedAxios.post.mockResolvedValue({ data: { data: [] } });
      const provider = new OpenRouterProvider('sk-or-test-key');
      await expect(provider.generateImage('x')).rejects.toThrow(/no image data/i);
    });

    it.each([
      [401, /invalid openrouter api key/i],
      [402, /insufficient openrouter credits/i],
      [404, /not found on openrouter/i],
      [429, /rate limit/i],
    ])('maps HTTP %s to an actionable message', async (status, pattern) => {
      mockedAxios.post.mockRejectedValue({
        response: { status, data: { error: { message: 'upstream says no' } } },
      });
      const provider = new OpenRouterProvider('sk-or-test-key');
      await expect(provider.generateImage('x')).rejects.toThrow(pattern);
    });
  });

  describe('AIService wiring', () => {
    it('creates an OpenRouterProvider from createProviderInstance with a key', () => {
      const provider = AIService.createProviderInstance('openrouter', 'sk-or-test-key');
      expect(provider).toBeInstanceOf(OpenRouterProvider);
    });

    it('returns null without a key (no env key in tests)', () => {
      expect(AIService.createProviderInstance('openrouter')).toBeNull();
    });

    it('does not regress existing providers', () => {
      expect(AIService.createProviderInstance('openai', 'sk-test')).toBeInstanceOf(OpenAIProvider);
      expect(AIService.createProviderInstance('ollama')).not.toBeNull();
    });

    it('listModels(type=image) returns the static OpenAI catalog unchanged', async () => {
      const models = await AIService.listModels({ provider: 'openai', type: 'image' });
      expect(models.length).toBeGreaterThan(0);
      expect(models.find((m) => m.isDefault)?.id).toBe('gpt-image-1.5');
    });

    it('listModels(type=image) discovers OpenRouter image models from the Images catalog', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          data: [
            { id: 'google/gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image', description: 'fast' },
            { id: 'black-forest-labs/flux-2-dev', name: 'FLUX 2 Dev', description: 'crisp' },
          ],
        },
      });

      const models = await AIService.listModels({
        provider: 'openrouter',
        apiKey: 'sk-or-img-1',
        type: 'image',
      });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${OPENROUTER_BASE_URL}/images/models`,
        expect.anything()
      );
      expect(models.map((m) => m.id)).toContain('black-forest-labs/flux-2-dev');
      expect(models.find((m) => m.isDefault)?.id).toBe('google/gemini-2.5-flash-image');
    });

    it('listModels(type=image) falls back to documented defaults without a key', async () => {
      const models = await AIService.listModels({ provider: 'openrouter', type: 'image' });
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe(OPENROUTER_DEFAULT_IMAGE_MODEL);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('listModels discovers OpenRouter text models and annotates vision support', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          data: [
            {
              id: 'deepseek/deepseek-chat',
              name: 'DeepSeek Chat',
              description: 'cheap chat',
              architecture: { input_modalities: ['text'], output_modalities: ['text'] },
            },
            {
              id: 'google/gemini-2.5-flash',
              name: 'Gemini 2.5 Flash',
              description: 'multimodal',
              architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
            },
          ],
        },
      });

      const models = await AIService.listModels({ provider: 'openrouter', apiKey: 'sk-or-txt-1' });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${OPENROUTER_BASE_URL}/models`,
        expect.anything()
      );
      const gemini = models.find((m) => m.id === 'google/gemini-2.5-flash');
      const deepseek = models.find((m) => m.id === 'deepseek/deepseek-chat');
      expect(gemini?.description).toMatch(/^\[Vision\]/);
      expect(deepseek?.description).not.toMatch(/^\[Vision\]/);
    });

    it('listModels falls back to documented defaults when discovery fails', async () => {
      mockedAxios.get.mockRejectedValue(new Error('network down'));
      const models = await AIService.listModels({ provider: 'openrouter', apiKey: 'sk-or-txt-2' });
      expect(models.find((m) => m.isDefault)?.id).toBe(OPENROUTER_DEFAULT_TEXT_MODEL);
    });
  });
});
