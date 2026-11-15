import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { mealPlanTemplateApi } from '@/services/api';

interface SaveAsTemplateModalProps {
  mealPlanId: string;
  mealPlanName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function SaveAsTemplateModal({
  mealPlanId,
  mealPlanName,
  onClose,
  onSuccess,
}: SaveAsTemplateModalProps) {
  const [name, setName] = useState(mealPlanName + ' Template');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const tagArray = tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      await mealPlanTemplateApi.createFromMealPlan({
        mealPlanId,
        name: name.trim(),
        description: description.trim() || undefined,
        tags: tagArray.length > 0 ? tagArray : undefined,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save template:', err);
      setError(err.response?.data?.error || 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl max-w-md w-full shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-medium leading-tight text-balance text-foreground">Save as template</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="templateName" className="block text-sm font-medium text-foreground mb-2">
              Template name *
            </label>
            <input
              id="templateName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., Weekly Family Dinners"
            />
          </div>

          <div>
            <label htmlFor="templateDescription" className="block text-sm font-medium text-foreground mb-2">
              Description (optional)
            </label>
            <textarea
              id="templateDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Describe this template"
            />
          </div>

          <div>
            <label htmlFor="templateTags" className="block text-sm font-medium text-foreground mb-2">
              Tags (optional)
            </label>
            <input
              id="templateTags"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., vegetarian, quick, budget-friendly (comma-separated)"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Separate tags with commas
            </p>
          </div>

          <div className="bg-muted rounded-lg p-4 border border-border">
            <p className="text-sm text-muted-foreground">
              This template will preserve the structure and recipes of your meal plan.
              You can reuse it to create new meal plans starting on any date.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !name.trim()}
            className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                Saving
              </>
            ) : (
              <>
                Save template
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
