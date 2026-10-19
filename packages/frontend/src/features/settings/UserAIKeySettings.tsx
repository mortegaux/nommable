import { useState, useEffect } from 'react';
import { aiApi } from '@/services/api';
import { invalidateAIStatus } from '@/hooks/useAIStatus';
import type { AIProvider, UserAIKeyConfig, AIMode } from '@nommable/shared';

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google AI (Gemini)',
  openrouter: 'OpenRouter (one key, many models)',
  ollama: 'Ollama (Local)',
};

const PROVIDER_OPTIONS: AIProvider[] = ['openai', 'anthropic', 'google', 'openrouter', 'ollama'];

const inputClassName =
  'w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary';
const labelClassName = 'block text-sm font-medium text-foreground mb-2';

export default function UserAIKeySettings({ hideHeader = false }: { hideHeader?: boolean }) {
  const [mode, setMode] = useState<AIMode>('shared');
  const [provider, setProvider] = useState<AIProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [hasKey, setHasKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await aiApi.getMyConfig();
      const config: UserAIKeyConfig = res.data;
      setMode(config.mode);
      if (config.provider && PROVIDER_OPTIONS.includes(config.provider)) {
        setProvider(config.provider);
      }
      setEnabled(config.enabled);
      setHasKey(config.hasApiKey);
      setMaskedKey(config.maskedKey);
      setBaseUrl(config.baseUrl || '');
      setApiKey('');
    } catch (error) {
      console.error('Failed to load your AI key settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setTestResult(null);
    setSaving(true);

    try {
      await aiApi.saveMyConfig({
        provider,
        apiKey: apiKey.trim() || undefined,
        baseUrl: provider === 'ollama' ? baseUrl.trim() || undefined : undefined,
        enabled,
      });
      setMessage('Your AI key was saved successfully');
      await load();
      invalidateAIStatus();
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Failed to save your AI key');
      console.error('Failed to save personal AI key:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Remove your saved AI key? AI features will stop working until you add a new one.')) {
      return;
    }
    setMessage('');
    setTestResult(null);
    setClearing(true);

    try {
      await aiApi.deleteMyConfig();
      setMessage('Your AI key was removed');
      await load();
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Failed to remove your AI key');
      console.error('Failed to delete personal AI key:', error);
    } finally {
      setClearing(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setMessage('');

    try {
      const response = await aiApi.testMyConfig({
        provider,
        apiKey: apiKey.trim() || undefined,
        baseUrl: provider === 'ollama' ? baseUrl.trim() || undefined : undefined,
      });
      setTestResult(response.data);
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.response?.data?.error || error.message || 'Failed to test connection',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading your AI key settings...</div>
      </div>
    );
  }

  return (
    <div className={hideHeader ? '' : 'mx-auto max-w-2xl'}>
      {!hideHeader && <h1 className="mb-6 text-3xl font-bold text-foreground">Your AI key</h1>}

      {mode === 'shared' ? (
        <div className="rounded-lg bg-card border border-border p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔑</span>
            <div>
              <p className="font-medium text-foreground">Using the instance shared key</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your admin manages a single AI key for everyone on this instance, so there&apos;s
                nothing for you to set up. All AI features just work.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-card border border-border p-6 shadow-sm">
          <p className="mb-6 text-muted-foreground">
            This instance uses per-user AI keys. Add your own provider key below to enable
            AI-powered features like recipe generation, enhancements, and ingredient detection.
            Your key is stored encrypted and is never shown to anyone else.
          </p>

          {/* Status line */}
          <div
            className={`mb-6 rounded p-3 border ${
              hasKey
                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800'
                : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800'
            }`}
          >
            {hasKey ? (
              <span>
                ✓ Using your own {PROVIDER_LABELS[provider] ?? provider} key
                {maskedKey ? ` (${maskedKey})` : ''}
              </span>
            ) : (
              <span>Add your API key below to enable AI features.</span>
            )}
          </div>

          {message && (
            <div
              className={`mb-4 rounded p-3 ${
                message.toLowerCase().includes('success') || message.toLowerCase().includes('saved') || message.toLowerCase().includes('removed')
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
                <span className="text-lg">{testResult.success ? '✓' : '✗'}</span>
                <div>
                  <strong>{testResult.success ? 'Connection Successful!' : 'Connection Failed'}</strong>
                  <p className="mt-1 text-sm">{testResult.message}</p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <label htmlFor="user-ai-provider" className={labelClassName}>
                AI Provider
              </label>
              <select
                id="user-ai-provider"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as AIProvider);
                  setMessage('');
                  setTestResult(null);
                }}
                className={inputClassName}
              >
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            {provider !== 'ollama' ? (
              <div>
                <label htmlFor="user-ai-key" className={labelClassName}>
                  API Key {!hasKey && <span className="text-destructive">*</span>}
                </label>
                <input
                  id="user-ai-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={hasKey ? 'Leave blank to keep your existing key' : 'Enter your API key'}
                  className={inputClassName}
                  required={!hasKey}
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {hasKey
                    ? 'Leave blank to keep your existing key. Your full key is never displayed.'
                    : 'Your API key is stored encrypted and never shown in full.'}
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor="user-ai-base-url" className={labelClassName}>
                  Base URL <span className="text-destructive">*</span>
                </label>
                <input
                  id="user-ai-base-url"
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className={inputClassName}
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter the base URL of your Ollama server (e.g. http://localhost:11434).
                </p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <input
                id="user-ai-enabled"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="user-ai-enabled" className="text-sm text-foreground">
                Enable AI features with this key
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save key'}
              </button>
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
              >
                {testing ? 'Testing...' : 'Test connection'}
              </button>
              {hasKey && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={clearing}
                  className="rounded-lg border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  {clearing ? 'Removing...' : 'Remove key'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
