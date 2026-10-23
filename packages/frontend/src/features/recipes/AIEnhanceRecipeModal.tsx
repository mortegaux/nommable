import { useState } from 'react';
import { recipeApi } from '@/services/api';
import { AutoAwesomeIcon } from '@/components/icons/MaterialIcon';
import { Dialog } from '@/components/Dialog';

interface AIEnhanceRecipeModalProps {
  recipeId: string;
  recipeTitle: string;
  enhancementType: 'improve_instructions' | 'add_tips' | 'optimize_ingredients';
  onClose: () => void;
  onSuccess: () => void;
}

const ENHANCEMENT_INFO = {
  improve_instructions: {
    title: 'Improve Instructions',
    description: 'Make cooking steps clearer and more detailed',
    icon: '📝',
  },
  add_tips: {
    title: 'Add Cooking Tips',
    description: 'Get helpful tips and tricks for this recipe',
    icon: '💡',
  },
  optimize_ingredients: {
    title: 'Optimize Ingredients',
    description: 'Get suggestions for ingredient improvements and substitutions',
    icon: '🔄',
  },
};

export function AIEnhanceRecipeModal({
  recipeId,
  recipeTitle,
  enhancementType,
  onClose,
  onSuccess,
}: AIEnhanceRecipeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const info = ENHANCEMENT_INFO[enhancementType];

  const handleEnhance = async () => {
    setError('');
    setLoading(true);
    setResult(null);

    try {
      const response = await recipeApi.enhanceWithAI(recipeId, enhancementType);
      setResult(response.data);
    } catch (err: any) {
      console.error('Failed to enhance recipe:', err);
      setError(err.response?.data?.error || 'Failed to enhance recipe. Please check your AI configuration.');
    } finally {
      setLoading(false);
    }
  };

  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    if (!result) return;
    setApplying(true);
    setError('');

    try {
      if (enhancementType === 'improve_instructions' && result.improvedInstructions) {
        await recipeApi.update(recipeId, { instructions: result.improvedInstructions });
      } else if (enhancementType === 'add_tips' && result.tips) {
        // Append tips to the recipe notes
        const tipsText = result.tips.join('\n');
        await recipeApi.update(recipeId, { notes: tipsText });
      }
      // optimize_ingredients is informational only — no auto-apply
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to apply enhancement:', err);
      setError(err.response?.data?.error || 'Failed to apply changes.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog title={info.title} onClose={onClose} panelClassName="max-w-3xl">
      <div className="p-6">
        <p className="text-sm text-muted-foreground mb-4">{recipeTitle}</p>

        {/* Content */}
        <div>
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive mb-4">
              {error}
            </div>
          )}

          {!result && !loading && (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">{info.icon}</div>
              <p className="text-muted-foreground mb-6">{info.description}</p>
              <button
                onClick={handleEnhance}
                className="px-6 py-3 rounded-lg border border-border bg-background font-medium text-foreground hover:bg-accent transition-all inline-flex items-center gap-2"
              >
                <AutoAwesomeIcon size={18} />
                {info.title}
              </button>
            </div>
          )}

          {loading && (
            <div className="text-center py-12">
              <svg className="animate-spin h-12 w-12 mx-auto text-primary mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-muted-foreground">AI is analyzing your recipe...</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="bg-accent/10 rounded-lg p-4 border border-accent/20">
                <div className="flex items-center gap-2 mb-3">
                  <AutoAwesomeIcon size={20} className="text-primary" />
                  <h3 className="font-semibold text-foreground">AI Suggestions</h3>
                </div>

                {enhancementType === 'improve_instructions' && result.improvedInstructions && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground mb-3">Enhanced cooking steps:</p>
                    <ol className="space-y-3 list-decimal list-inside">
                      {result.improvedInstructions.map((instruction: string, index: number) => (
                        <li key={index} className="text-foreground leading-relaxed">
                          <span className="ml-2">{instruction}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {enhancementType === 'add_tips' && result.tips && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground mb-3">Helpful cooking tips:</p>
                    <ul className="space-y-3">
                      {result.tips.map((tip: string, index: number) => (
                        <li key={index} className="flex items-start gap-3">
                          <span className="text-primary mt-1">•</span>
                          <span className="text-foreground flex-1">{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {enhancementType === 'optimize_ingredients' && result.optimizations && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground mb-3">Ingredient optimization suggestions:</p>
                    {result.optimizations.map((opt: any, index: number) => (
                      <div key={index} className="bg-background rounded-lg p-3 border border-border">
                        <div className="font-medium text-foreground mb-1">
                          {opt.original} → {opt.suggestion}
                        </div>
                        <div className="text-sm text-muted-foreground">{opt.reason}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    These are AI-generated suggestions. Click &quot;Apply&quot; to update the recipe.
                  </p>
                  {enhancementType === 'improve_instructions' && result.improvedInstructions && (
                    <p className="text-xs font-medium text-foreground mt-1">
                      Applying will replace the recipe&apos;s instructions with {result.improvedInstructions.length} updated steps.
                    </p>
                  )}
                  {enhancementType === 'add_tips' && result.tips && (
                    <p className="text-xs font-medium text-foreground mt-1">
                      Applying will add {result.tips.length} {result.tips.length === 1 ? 'tip' : 'tips'} to the recipe notes.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-end gap-3">
          {result ? (
            <>
              <button
                onClick={onClose}
                disabled={applying}
                className="px-6 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                {enhancementType === 'optimize_ingredients' ? 'Close' : 'Dismiss'}
              </button>
              {enhancementType !== 'optimize_ingredients' && (
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all disabled:opacity-50"
                >
                  {applying ? 'Applying...' : enhancementType === 'improve_instructions' ? 'Apply Instructions' : 'Apply Tips'}
                </button>
              )}
            </>
          ) : (
            <button
              onClick={onClose}
              disabled={loading}
              className="px-6 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
