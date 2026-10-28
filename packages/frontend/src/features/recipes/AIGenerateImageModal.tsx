import { useState, useEffect } from 'react';
import { aiErrorMessage } from '@/utils/aiValidation';
import { useAuthStore } from '@/store/auth.store';
import { recipeApi } from '@/services/api';
import { Sparkles, RefreshCw, Check, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Dialog } from '@/components/Dialog';

interface AIGenerateImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipeId?: string;
  recipeTitle: string;
  recipeDescription?: string;
  recipeCuisine?: string;
  onImageGenerated: (imageUrl: string) => void;
}

const STYLE_PRESETS = [
  { label: 'Restaurant Plating', prompt: 'Gourmet restaurant plating, fine dining tableware, elegant garnish, delicate sauce drizzle' },
  { label: 'Rustic Home-cooked', prompt: 'Rustic wooden table, warm ambient lighting, cozy home-cooked aesthetic, cast iron cookware' },
  { label: 'Bright & Airy', prompt: 'Bright natural daylight, crisp clean kitchen background, fresh herbs, modern minimalist setting' },
  { label: 'Dark & Moody', prompt: 'Moody dark ceramic surface, dramatic side lighting, rich shadows, artisanal chef presentation' },
];

export function AIGenerateImageModal({
  isOpen,
  onClose,
  recipeId,
  recipeTitle,
  recipeDescription,
  recipeCuisine,
  onImageGenerated,
}: AIGenerateImageModalProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setGeneratedImageUrl(null);
      setSelectedModel('');
      setIsCustomModel(false);
      // Generate a default descriptive prompt based on the recipe
      const parts: string[] = [];
      parts.push(`A mouthwatering, professional food photograph of ${recipeTitle}.`);
      if (recipeDescription) {
        parts.push(recipeDescription.slice(0, 100));
      }
      if (recipeCuisine) {
        parts.push(`Traditional ${recipeCuisine} style.`);
      }
      parts.push('Plated beautifully, restaurant quality, garnished, warm natural lighting, 8k food photography.');
      setPrompt(parts.join(' '));
    }
  }, [isOpen, recipeTitle, recipeDescription, recipeCuisine]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setError('');
    setLoading(true);

    try {
      const effectiveModel = selectedModel.trim() || undefined;
      if (recipeId) {
        // Generate and automatically update existing recipe
        const res = await recipeApi.generateImage(recipeId, prompt.trim(), effectiveModel);
        setGeneratedImageUrl(res.data.imageUrl);
      } else {
        // Generate preview for recipe in creation mode
        const res = await recipeApi.generateImagePreview({
          title: recipeTitle,
          description: recipeDescription,
          cuisine: recipeCuisine,
          prompt: prompt.trim(),
          model: effectiveModel,
        });
        setGeneratedImageUrl(res.data.imageUrl);
      }

      // Image generation (saved or preview) is a metered AI generation —
      // refresh the credits badge so it stays accurate without a reload.
      await useAuthStore.getState().refreshUser();
    } catch (err: any) {
      console.error('Image generation error:', err);
      const msg = aiErrorMessage(
        err,
        err.message || 'Failed to generate image. Please check your AI configuration in Settings.'
      );
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (generatedImageUrl) {
      onImageGenerated(generatedImageUrl);
      onClose();
    }
  };

  const applyPreset = (presetPrompt: string) => {
    setPrompt((prev: string) => {
      const base = prev.split('.')[0] || `A mouthwatering culinary photograph of ${recipeTitle}`;
      return `${base}. ${presetPrompt}, natural lighting, photorealistic.`;
    });
  };

  return (
    <Dialog title="Generate Recipe Image" onClose={onClose} panelClassName="max-w-xl">
      <div className="p-6">
        <p className="text-xs text-muted-foreground mb-4">Powered by Google Imagen 3 or OpenAI DALL-E</p>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Main Content */}
        <div className="mt-5 space-y-4">
          {/* Generated Image Preview */}
          {generatedImageUrl ? (
            <div className="relative rounded-xl overflow-hidden border border-border shadow-md bg-muted aspect-square max-h-80 w-full mx-auto">
              <img
                src={generatedImageUrl}
                alt={recipeTitle}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-green-400" />
                Generated with AI
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-8 text-center bg-muted/30">
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                <ImageIcon className="w-6 h-6" />
              </div>
              <h4 className="font-semibold text-foreground text-sm">AI Food Photography</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                Generate an appetizing, high-resolution photo for &quot;{recipeTitle}&quot; using your configured AI provider.
              </p>
            </div>
          )}

          {/* Style Presets */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Style Inspiration
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset.prompt)}
                  disabled={loading}
                  className="text-xs px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-accent text-foreground transition-colors disabled:opacity-50"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <label htmlFor="modal-image-model" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Image Generation Model
            </label>
            <select
              id="modal-image-model"
              value={isCustomModel ? '__custom__' : selectedModel}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__custom__') {
                  setIsCustomModel(true);
                } else {
                  setIsCustomModel(false);
                  setSelectedModel(val);
                }
              }}
              disabled={loading}
              className="w-full text-xs rounded-xl border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              <option value="">Default (Configured in AI Settings)</option>
              <optgroup label="OpenAI Image Models">
                <option value="gpt-image-1.5">GPT-Image 1.5 (Recommended / Fast)</option>
                <option value="gpt-image-2.5-sunburst">GPT-Image 2.5 Sunburst (Flagship Quality)</option>
                <option value="gpt-image-1">GPT-Image 1 (Standard)</option>
                <option value="dall-e-3">DALL-E 3 (Retired by OpenAI)</option>
                <option value="dall-e-2">DALL-E 2 (Retired by OpenAI)</option>
              </optgroup>
              <optgroup label="Google AI">
                <option value="gemini-2.0-flash">Gemini 2.0 Flash (Multimodal Photo)</option>
                <option value="imagen-3.0-generate-002">Imagen 3 High Quality (Requires billing)</option>
                <option value="imagen-3.0-fast-generate-001">Imagen 3 Fast (Requires billing)</option>
              </optgroup>
              <option value="__custom__">Custom model (enter manually)...</option>
            </select>

            {isCustomModel && (
              <div className="mt-1.5">
                <input
                  type="text"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  placeholder="e.g. gpt-image-1.5, imagen-3.0-generate-002, dall-e-3"
                  disabled={loading}
                  className="w-full text-xs rounded-xl border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* Prompt customization */}
          <div>
            <label htmlFor="image-prompt" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              AI Prompt (Customize if desired)
            </label>
            <textarea
              id="image-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              className="w-full text-sm rounded-xl border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 resize-none"
              placeholder="Describe the desired presentation, lighting, and table setting..."
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex gap-3 pt-4 border-t border-border">
          {generatedImageUrl ? (
            <>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Regenerate
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
              >
                <Check className="w-4 h-4" />
                Apply to Recipe
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating Image...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Photo</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
