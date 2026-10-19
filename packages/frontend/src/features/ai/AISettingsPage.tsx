import { useState, useEffect } from 'react';
import { aiApi } from '@/services/api';
import { invalidateAIStatus } from '@/hooks/useAIStatus';
import type { AIProvider, AIModelInfo, AIMode } from '@nommable/shared';

/** What a single key from each provider actually unlocks in Nommable. */
const PROVIDER_COVERAGE: Record<string, string> = {
  openai: 'This key covers: recipe text, photo features (vision), and image generation.',
  anthropic: 'This key covers: recipe text and photo features (vision). Image generation is not supported — choose an image model below with a separate key if you need it.',
  google: 'This key covers: recipe text, photo features (vision), and image generation.',
  openrouter: 'This key covers: recipe text, photo features (vision), and image generation — all from this one key. Billing stays on your OpenRouter account.',
  ollama: 'This key covers: recipe text only. Image generation is not supported, and photo features depend on the local model.',
};

export default function AISettingsPage({ hideHeader = false }: { hideHeader?: boolean }) {
  const [provider, setProvider] = useState<AIProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [aiMode, setAiMode] = useState<AIMode>('shared');
  const [loading, setLoading] = useState(true);
  const [hasExisting, setHasExisting] = useState(false);
  const [message, setMessage] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Dynamic models state
  const [availableModels, setAvailableModels] = useState<AIModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [isCustomModel, setIsCustomModel] = useState(false);

  // Image model state
  const [imageModel, setImageModel] = useState('');
  const [isCustomImageModel, setIsCustomImageModel] = useState(false);
  const [imageApiKey, setImageApiKey] = useState('');
  const [hasImageApiKey, setHasImageApiKey] = useState(false);
  // Live-discovered OpenRouter image models (dedicated Images API catalog)
  const [availableImageModels, setAvailableImageModels] = useState<AIModelInfo[]>([]);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadModels = async (
    targetProvider: AIProvider,
    forceRefresh = false,
    checkModel?: string,
    targetBaseUrl?: string
  ) => {
    if (targetProvider === 'none') {
      setAvailableModels([]);
      return;
    }

    setLoadingModels(true);
    try {
      const res = await aiApi.getModels({
        provider: targetProvider,
        apiKey: apiKey || undefined,
        baseUrl: (targetBaseUrl !== undefined ? targetBaseUrl : baseUrl) || undefined,
        refresh: forceRefresh,
      });

      const models = res.data.models || [];
      setAvailableModels(models);

      const modelToCheck = checkModel !== undefined ? checkModel : model;
      if (modelToCheck) {
        const exists = models.some((m) => m.id === modelToCheck);
        setIsCustomModel(!exists);
      }

      // OpenRouter image models come from the dedicated Images API catalog
      if (targetProvider === 'openrouter') {
        try {
          const imgRes = await aiApi.getModels({
            provider: 'openrouter',
            apiKey: apiKey || undefined,
            refresh: forceRefresh,
            type: 'image',
          });
          setAvailableImageModels(imgRes.data.models || []);
        } catch (imgErr) {
          console.warn('Failed to load OpenRouter image models:', imgErr);
          setAvailableImageModels([]);
        }
      } else {
        setAvailableImageModels([]);
      }
    } catch (err) {
      console.warn('Failed to load models:', err);
    } finally {
      setLoadingModels(false);
    }
  };

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await aiApi.getConfig();
      const config = response.data;
      const loadedProvider = config.provider as AIProvider;
      const loadedModel = config.model || '';
      const loadedImageModel = config.imageModel || '';
      const loadedBaseUrl = config.baseUrl || '';

      setProvider(loadedProvider);
      setModel(loadedModel);
      setImageModel(loadedImageModel);
      if (loadedImageModel) {
        const known = [
          'gemini-2.0-flash',
          'imagen-3.0-generate-002',
          'imagen-3.0-fast-generate-001',
          'gpt-image-1.5',
          'gpt-image-2.5-sunburst',
          'gpt-image-1',
          'dall-e-3',
          'dall-e-2',
          'google/gemini-2.5-flash-image',
        ];
        setIsCustomImageModel(!known.includes(loadedImageModel));
      } else {
        setIsCustomImageModel(false);
      }
      setBaseUrl(loadedBaseUrl);
      setEnabled(config.enabled);
      setAiMode(config.aiMode === 'per-user' ? 'per-user' : 'shared');
      setHasExisting(true);
      setApiKey(''); // Never load API key for security
      setImageApiKey('');
      setHasImageApiKey(!!config.hasImageApiKey);

      await loadModels(loadedProvider, false, loadedModel, loadedBaseUrl);
    } catch (error: any) {
      if (error.response?.status !== 404) {
        console.error('Failed to load AI config:', error);
      }
      setHasExisting(false);
      await loadModels('openai', false, '', '');
    } finally {
      setLoading(false);
    }
  };

  // Handle provider change - clear irrelevant fields and load corresponding models
  const handleProviderChange = (newProvider: AIProvider) => {
    setProvider(newProvider);
    setMessage('');
    setTestResult(null);
    setModel('');
    setIsCustomModel(false);
    setImageModel('');
    setIsCustomImageModel(false);
    setImageApiKey('');

    let newBaseUrl = baseUrl;
    if (newProvider === 'ollama') {
      setApiKey('');
      if (!newBaseUrl) newBaseUrl = 'http://localhost:11434';
      setBaseUrl(newBaseUrl);
    } else if (newProvider === 'none') {
      setApiKey('');
      setModel('');
      setBaseUrl('');
      newBaseUrl = '';
    } else {
      setBaseUrl('');
      newBaseUrl = '';
    }

    if (newProvider !== 'none') {
      loadModels(newProvider, false, '', newBaseUrl);
    } else {
      setAvailableModels([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setTestResult(null);
    setSaving(true);

    try {
      const configData = {
        provider,
        apiKey: apiKey || undefined,
        imageApiKey: imageApiKey ? imageApiKey.trim() : undefined,
        model: model.trim(), // Send empty string to clear, not undefined
        imageModel: imageModel.trim(), // Send empty string to clear, not undefined
        baseUrl: baseUrl.trim(), // Send empty string to clear, not undefined
        enabled,
        aiMode,
      };

      if (hasExisting) {
        await aiApi.updateConfig(configData);
        setMessage('AI settings updated successfully');
      } else {
        await aiApi.createConfig(configData);
        setHasExisting(true);
        setMessage('AI settings created successfully');
      }

      await loadConfig();
      setApiKey(''); // Clear API key field after saving
      setImageApiKey('');
      // Bust the cached AI status so buttons update their visual state immediately.
      invalidateAIStatus();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Failed to save AI settings';
      setMessage(errorMsg);
      console.error('Failed to save AI config:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setMessage('');

    try {
      const response = await aiApi.testConnection({
        provider,
        apiKey: apiKey || undefined,
        model: model ? model.trim() : undefined,
        baseUrl: baseUrl ? baseUrl.trim() : undefined,
      });
      setTestResult(response.data);
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        (error.response?.status === 502
          ? 'Backend service is starting up or temporarily unreachable (502 Bad Gateway). Please wait a few seconds and try again.'
          : error.message) ||
        'Failed to test connection. Make sure you have entered valid credentials or saved your settings.';
      setTestResult({
        success: false,
        message: errorMsg,
      });
    } finally {
      setTesting(false);
    }
  };

  const defaultModel = availableModels.find((m) => m.isDefault);

  // Cross-provider image key: needed when the chosen image model belongs to a
  // different provider than the primary text key (e.g. OpenAI image model with
  // a Google text key, or an OpenRouter `vendor/slug` image model with any
  // other text provider).
  const needsOpenAIImageKey =
    provider !== 'openai' &&
    (imageModel.startsWith('dall-e') ||
      imageModel.startsWith('gpt-image') ||
      (isCustomImageModel && !imageModel.includes('/')));
  const needsOpenRouterImageKey = provider !== 'openrouter' && imageModel.includes('/');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading AI settings...</div>
      </div>
    );
  }

  return (
    <div className={hideHeader ? '' : 'mx-auto max-w-2xl'}>
      {!hideHeader && <h1 className="mb-6 text-3xl font-bold text-foreground">AI Settings</h1>}

      <div className="rounded-lg bg-card border border-border p-6 shadow-sm">
        <p className="mb-6 text-muted-foreground">
          Configure your AI provider to enable AI-powered features like recipe generation,
          meal plan suggestions, and ingredient substitutions.
        </p>

        {message && (
          <div
            className={`mb-4 rounded p-3 ${
              message.toLowerCase().includes('success')
                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
            }`}
          >
            {message}
          </div>
        )}

        {testResult && (
          <div
            className={`mb-4 rounded p-3 ${
              testResult.success
                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg">
                {testResult.success ? '✓' : '✗'}
              </span>
              <div>
                <strong>{testResult.success ? 'Connection Successful!' : 'Connection Failed'}</strong>
                <p className="mt-1 text-sm">{testResult.message}</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Key Mode */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Key mode
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-3 rounded-lg border border-input p-3 cursor-pointer hover:bg-accent/50">
                <input
                  type="radio"
                  name="aiMode"
                  value="shared"
                  checked={aiMode === 'shared'}
                  onChange={() => setAiMode('shared')}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">Shared (site-wide)</span>
                  <span className="block text-xs text-muted-foreground">
                    Everyone uses the key configured below. This is the current behavior.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-input p-3 cursor-pointer hover:bg-accent/50">
                <input
                  type="radio"
                  name="aiMode"
                  value="per-user"
                  checked={aiMode === 'per-user'}
                  onChange={() => setAiMode('per-user')}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">Per-user (BYOK)</span>
                  <span className="block text-xs text-muted-foreground">
                    Each user adds their own API key under Settings → AI Key. The key below is
                    ignored. Users without a key can&apos;t use AI features.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Provider Selection */}
          <div>
            <label htmlFor="provider" className="block text-sm font-medium text-foreground mb-2">
              AI Provider
            </label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="openai">OpenAI (GPT-4o, o1, GPT-4)</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="google">Google AI (Gemini)</option>
              <option value="openrouter">OpenRouter (one key, many models)</option>
              <option value="ollama">Ollama (Local)</option>
              <option value="none">None (Disable AI)</option>
            </select>
          </div>

          {provider !== 'none' && (
            <>
              {/* API Key for cloud providers */}
              {provider !== 'ollama' && (
                <div>
                  <label htmlFor="apiKey" className="block text-sm font-medium text-foreground mb-2">
                    API Key {!hasExisting && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    id="apiKey"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={hasExisting ? 'Leave blank to keep existing key' : 'Enter API key'}
                    className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    required={!hasExisting}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {hasExisting
                      ? 'Leave blank to keep your existing API key'
                      : 'Your API key will be stored securely'}
                  </p>
                </div>
              )}

              {/* Base URL for Ollama */}
              {provider === 'ollama' && (
                <div>
                  <label htmlFor="baseUrl" className="block text-sm font-medium text-foreground mb-2">
                    Base URL <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="baseUrl"
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Enter base URL only (e.g., http://localhost:11434). Do not include /api/generate
                  </p>
                </div>
              )}

              {/* Model */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="model-select" className="block text-sm font-medium text-foreground">
                    Text & Recipe Generation Model (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={() => loadModels(provider, true)}
                    disabled={loadingModels}
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
                    title="Fetch latest models from provider"
                  >
                    <svg
                      className={`h-3.5 w-3.5 ${loadingModels ? 'animate-spin' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 16h5v5" />
                    </svg>
                    <span>{loadingModels ? 'Fetching...' : 'Refresh models'}</span>
                  </button>
                </div>

                <select
                  id="model-select"
                  value={isCustomModel ? '__custom__' : model}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__custom__') {
                      setIsCustomModel(true);
                    } else {
                      setIsCustomModel(false);
                      setModel(val);
                    }
                  }}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">
                    {defaultModel ? `Default (${defaultModel.name})` : 'Default (recommended model)'}
                  </option>
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}{m.description ? ` — ${m.description}` : ''}{m.isDefault ? ' (Default)' : ''}
                    </option>
                  ))}
                  <option value="__custom__">Custom model (enter manually)...</option>
                </select>

                {isCustomModel && (
                  <div className="mt-2">
                    <input
                      id="custom-model-input"
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={
                        provider === 'openai'
                          ? 'e.g. gpt-4o, o1'
                          : provider === 'anthropic'
                            ? 'e.g. claude-3-5-sonnet-20241022'
                            : provider === 'google'
                              ? 'e.g. gemini-1.5-flash'
                              : provider === 'openrouter'
                                ? 'e.g. openai/gpt-4o-mini, anthropic/claude-sonnet-4'
                                : 'e.g. llama3.2'
                      }
                      className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      autoFocus
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Enter any custom model identifier supported by your provider
                    </p>
                  </div>
                )}

                <p className="mt-1 text-xs text-muted-foreground">
                  Select a model or leave as default. Click &quot;Refresh models&quot; to fetch the latest available models.
                </p>
              </div>

              {/* Image Generation Model */}
              <div>
                <label htmlFor="image-model-select" className="block text-sm font-medium text-foreground mb-2">
                  Image Generation Model (Optional)
                </label>
                <select
                  id="image-model-select"
                  value={isCustomImageModel ? '__custom__' : imageModel}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__custom__') {
                      setIsCustomImageModel(true);
                    } else {
                      setIsCustomImageModel(false);
                      setImageModel(val);
                    }
                  }}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">
                    {provider === 'google'
                      ? 'Default (Google Gemini 2.0 Flash / Imagen 3)'
                      : provider === 'openai'
                      ? 'Default (OpenAI GPT-Image 1.5)'
                      : provider === 'openrouter'
                      ? 'Default (OpenRouter recommended image model)'
                      : 'Default (Provider standard)'}
                  </option>
                  <optgroup label="OpenAI Image Models">
                    <option value="gpt-image-1.5">GPT-Image 1.5 (Recommended / Fast)</option>
                    <option value="gpt-image-2.5-sunburst">GPT-Image 2.5 Sunburst (Flagship Quality)</option>
                    <option value="gpt-image-1">GPT-Image 1 (Standard)</option>
                    <option value="dall-e-3">DALL-E 3 (Retired by OpenAI)</option>
                    <option value="dall-e-2">DALL-E 2 (Retired by OpenAI)</option>
                  </optgroup>
                  <optgroup label="Google AI">
                    <option value="gemini-2.0-flash">
                      Gemini 2.0 Flash (Multimodal photo generation)
                    </option>
                    <option value="imagen-3.0-generate-002">
                      Imagen 3 High Quality (Requires Google Cloud billing)
                    </option>
                    <option value="imagen-3.0-fast-generate-001">
                      Imagen 3 Fast (Requires Google Cloud billing)
                    </option>
                  </optgroup>
                  {provider === 'openrouter' && availableImageModels.length > 0 && (
                    <optgroup label="OpenRouter Image Models (live catalog)">
                      {availableImageModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}{m.description ? ` — ${m.description}` : ''}{m.isDefault ? ' (Default)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value="__custom__">Custom model (enter manually)...</option>
                </select>

                {isCustomImageModel && (
                  <div className="mt-2">
                    <input
                      id="custom-image-model-input"
                      type="text"
                      value={imageModel}
                      onChange={(e) => setImageModel(e.target.value)}
                      placeholder="e.g. gpt-image-1.5, gemini-2.0-flash, google/gemini-2.5-flash-image"
                      className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      autoFocus
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Enter any image generation model identifier — Google AI, OpenAI, or an OpenRouter <code>vendor/slug</code> model
                    </p>
                  </div>
                )}

                {/* Optional Image API key for cross-provider image models (e.g. OpenAI
                    image model with a Google text key, or an OpenRouter image model
                    with any other text provider) */}
                {(needsOpenAIImageKey || needsOpenRouterImageKey) && (
                  <div className="mt-3 p-3 rounded-lg border border-border bg-muted/30">
                    <label htmlFor="image-api-key" className="block text-xs font-semibold text-foreground mb-1">
                      {needsOpenRouterImageKey ? 'OpenRouter API Key for Images (Optional)' : 'OpenAI API Key for Images (Optional)'}
                    </label>
                    <input
                      id="image-api-key"
                      type="password"
                      value={imageApiKey}
                      onChange={(e) => setImageApiKey(e.target.value)}
                      placeholder={hasImageApiKey ? '•••••••••••••••• (API key saved)' : needsOpenRouterImageKey ? 'sk-or-... (Enter OpenRouter key)' : 'sk-... (Enter OpenAI key for DALL-E)'}
                      className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {needsOpenRouterImageKey
                        ? 'Enter your OpenRouter API key to generate images with an OpenRouter image model while using a different text provider.'
                        : 'Enter your OpenAI API key if your primary text provider is Google, Anthropic, or Ollama, but you want to generate images using DALL-E.'}
                    </p>
                  </div>
                )}

                <p className="mt-1 text-xs text-muted-foreground">
                  Select a dedicated model for recipe photo generation, independent of text generation. Note: Google Imagen requires billing enabled on your Google Cloud project.
                </p>
              </div>

              {/* Enable AI Features */}
              <div className="flex items-center">
                <input
                  id="enabled"
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-primary"
                />
                <label htmlFor="enabled" className="ml-2 text-sm font-medium text-foreground">
                  Enable AI Features
                </label>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-primary-foreground font-medium hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            {(hasExisting || apiKey || provider === 'ollama') && provider !== 'none' && (
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="flex-1 rounded-lg bg-green-700 px-4 py-2 text-white font-medium hover:bg-green-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            )}
          </div>
        </form>

        {/* Provider-specific help text */}
        {provider !== 'none' && (
          <div className="mt-6 p-4 bg-accent/10 border border-accent/20 rounded-lg">
            <h3 className="text-sm font-semibold text-foreground mb-2">
              {provider === 'openai' && 'OpenAI Setup'}
              {provider === 'anthropic' && 'Anthropic Setup'}
              {provider === 'google' && 'Google AI Setup'}
              {provider === 'openrouter' && 'OpenRouter Setup'}
              {provider === 'ollama' && 'Ollama Setup'}
            </h3>
            <div className="text-xs text-muted-foreground space-y-1">
              {PROVIDER_COVERAGE[provider] && (
                <p className="font-medium text-foreground/80">{PROVIDER_COVERAGE[provider]}</p>
              )}
              {provider === 'openai' && (
                <>
                  <p>Get your API key from: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">platform.openai.com/api-keys</a></p>
                  <p>Available models are dynamically retrieved from OpenAI.</p>
                </>
              )}
              {provider === 'anthropic' && (
                <>
                  <p>Get your API key from: <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.anthropic.com/settings/keys</a></p>
                  <p>Available models are dynamically retrieved from the Anthropic API.</p>
                </>
              )}
              {provider === 'google' && (
                <>
                  <p>Get your API key from: <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">makersuite.google.com/app/apikey</a></p>
                  <p>Available models are dynamically retrieved from Google AI Studio.</p>
                </>
              )}
              {provider === 'openrouter' && (
                <>
                  <p>Get your API key from: <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">openrouter.ai/keys</a> (starts with <code className="bg-background px-1 py-0.5 rounded">sk-or-</code>)</p>
                  <p>One key reaches hundreds of text, vision, and image models. Text models are discovered live — entries marked [Vision] support photo features like pantry scan. Image models come from OpenRouter&apos;s dedicated image catalog.</p>
                </>
              )}
              {provider === 'ollama' && (
                <>
                  <p>Make sure Ollama is running and accessible at the Base URL.</p>
                  <p>Models are populated from your local Ollama instance (<code className="bg-background px-1 py-0.5 rounded">/api/tags</code>).</p>
                  <p>Pull a model: <code className="bg-background px-1 py-0.5 rounded">ollama pull llama3.2</code></p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
