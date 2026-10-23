import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { recipeApi } from '@/services/api';
import { AutoAwesomeIcon, WarningIcon } from '@/components/icons/MaterialIcon';
import { Dialog } from '@/components/Dialog';
import { compressImages } from '@/utils/compressImage';
import type { RecipeCreateDto } from '@nommable/shared';

interface AIExtractRecipeModalProps {
  onClose: () => void;
}

export function AIExtractRecipeModal({ onClose }: AIExtractRecipeModalProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [extractedRecipe, setExtractedRecipe] = useState<RecipeCreateDto | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).slice(0, 5); // Max 5 files
      const compressed = await compressImages(selectedFiles);
      setFiles(compressed);
      setError('');
    }
  };

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();

    if (files.length === 0) {
      setError('Please select at least one image file');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await recipeApi.extractFromImages(files);
      setExtractedRecipe(response.data);
    } catch (err: any) {
      console.error('Failed to extract recipe:', err);
      setError(err.response?.data?.error || 'Failed to extract recipe. Please check your AI configuration and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRecipe = async () => {
    if (!extractedRecipe) return;

    try {
      setLoading(true);
      const response = await recipeApi.create(extractedRecipe);
      const recipeId = response.data.id;

      // Close modal and navigate to the new recipe
      onClose();
      navigate(`/recipes/${recipeId}`);
    } catch (err: any) {
      console.error('Failed to save recipe:', err);
      setError(err.response?.data?.error || 'Failed to save recipe');
      setLoading(false);
    }
  };

  const handleBack = () => {
    setExtractedRecipe(null);
    setFiles([]);
    setError('');
  };

  // Remove a file from the list
  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Dialog title="Extract Recipe from Images" onClose={onClose} panelClassName="max-w-4xl">
      <div className="p-6">
        <p className="text-sm text-muted-foreground mb-4">
          Upload screenshots of recipes (max 5 images)
        </p>

        {/* Content */}
        <div>
          {!extractedRecipe ? (
            /* Upload Form */
            <form onSubmit={handleExtract} className="space-y-6">
              {/* Cost Warning */}
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
                <div className="flex gap-3">
                  <WarningIcon size={20} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-amber-900 mb-1">AI Vision Cost Notice</h3>
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Extracting recipes from images uses AI vision models, which have higher costs than text-only AI features.
                      Each image processed will consume AI tokens.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                  {error}
                </div>
              )}

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Select Images <span className="text-destructive">*</span>
                </label>
                <input
                  id="files-camera"
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={loading}
                />
                <input
                  id="files-gallery"
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={loading}
                />
                <div className="flex gap-3">
                  <label
                    htmlFor="files-camera"
                    className={`cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors ${loading ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Take Photo
                  </label>
                  <label
                    htmlFor="files-gallery"
                    className={`cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm font-medium hover:bg-accent transition-colors ${loading ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Choose from Gallery
                  </label>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Supported formats: PNG, JPG, WebP • Maximum 5 images • Auto-compressed for upload
                </p>
              </div>

              {/* File List */}
              {files.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Selected Files ({files.length}/5)</h3>
                  <div className="space-y-2">
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 rounded-lg bg-accent/10 border border-accent/20"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">
                            🖼️
                          </div>
                          <div>
                            <div className="font-medium text-foreground text-sm">{file.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Remove file"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
                <h3 className="font-semibold text-blue-900 mb-2">How it works</h3>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                  <li>Upload screenshots of recipes from paywalled sites or cookbooks</li>
                  <li>AI vision will extract ingredients, instructions, and other details</li>
                  <li>You'll be able to review and edit the extracted recipe before saving</li>
                  <li>Supports up to 5 images if the recipe spans multiple screenshots</li>
                </ul>
              </div>
            </form>
          ) : (
            /* Recipe Preview */
            <div className="space-y-4">
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
                <h3 className="font-semibold text-green-900 mb-1">✓ Recipe Extracted Successfully</h3>
                <p className="text-sm text-green-800 dark:text-green-200">
                  Review the extracted recipe below. You can edit it before saving.
                </p>
                <p className="text-sm font-medium text-green-900 mt-2">
                  Saving will create a new recipe with {extractedRecipe.ingredients?.length || 0} ingredients
                  and {extractedRecipe.instructions?.length || 0} steps
                  {extractedRecipe.tags?.length ? `, tagged ${extractedRecipe.tags.join(', ')}` : ''}.
                </p>
              </div>

              <div className="space-y-4 border border-border rounded-lg p-4 bg-accent/5">
                <div>
                  <h3 className="text-lg font-bold text-foreground">{extractedRecipe.title}</h3>
                  {extractedRecipe.description && (
                    <p className="text-muted-foreground mt-1">{extractedRecipe.description}</p>
                  )}
                </div>

                {(extractedRecipe.servings || extractedRecipe.prepTime || extractedRecipe.cookTime) && (
                  <div className="flex gap-4 text-sm">
                    {extractedRecipe.servings && (
                      <div><strong>Servings:</strong> {extractedRecipe.servings}</div>
                    )}
                    {extractedRecipe.prepTime && (
                      <div><strong>Prep:</strong> {extractedRecipe.prepTime}min</div>
                    )}
                    {extractedRecipe.cookTime && (
                      <div><strong>Cook:</strong> {extractedRecipe.cookTime}min</div>
                    )}
                  </div>
                )}

                {extractedRecipe.ingredients && extractedRecipe.ingredients.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Ingredients</h4>
                    <ul className="space-y-1 text-sm">
                      {extractedRecipe.ingredients.map((ing, i) => (
                        <li key={i} className="text-muted-foreground">
                          {ing.quantity && `${ing.quantity} `}
                          {ing.unit && `${ing.unit} `}
                          {ing.name}
                          {ing.notes && ` (${ing.notes})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {extractedRecipe.instructions && extractedRecipe.instructions.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Instructions</h4>
                    <ol className="space-y-2 text-sm list-decimal list-inside">
                      {extractedRecipe.instructions.map((step, i) => (
                        <li key={i} className="text-muted-foreground">{step}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {extractedRecipe.tags && extractedRecipe.tags.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {extractedRecipe.tags.map((tag, i) => (
                        <span key={i} className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Note: The extracted recipe will be saved as-is. You can edit it after saving by viewing the recipe details.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-end gap-3">
          {!extractedRecipe ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-6 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExtract}
                disabled={loading || files.length === 0}
                className="px-6 py-2 rounded-lg border border-border bg-background font-medium text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Extracting...
                  </>
                ) : (
                  <>
                    <AutoAwesomeIcon size={18} />
                    Extract Recipe
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className="px-6 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleSaveRecipe}
                disabled={loading}
                className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? 'Saving...' : 'Save Recipe'}
              </button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
