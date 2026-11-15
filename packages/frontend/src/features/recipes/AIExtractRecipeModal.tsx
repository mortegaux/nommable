import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { recipeApi } from '@/services/api';
import { AlertTriangle, Camera, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { Callout } from '@/components/Callout';
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

      // Extraction is the metered AI generation (saving is plain CRUD) —
      // refresh the credits badge so it stays accurate without a reload.
      await useAuthStore.getState().refreshUser();
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
    <Dialog title="Extract recipe from images" onClose={onClose} size="wide">
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
              <Callout tone="warning" title="AI vision cost notice" icon={<AlertTriangle className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />}>
                <p>
                  Extracting recipes from images uses AI vision models, which have higher costs than text-only AI features.
                  Each image processed will consume AI tokens.
                </p>
              </Callout>

              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                  {error}
                </div>
              )}

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Select images <span className="text-destructive">*</span>
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
                    <Camera className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    Take Photo
                  </label>
                  <label
                    htmlFor="files-gallery"
                    className={`cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm font-medium hover:bg-accent transition-colors ${loading ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <ImageIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
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
                  <h3 className="text-sm font-medium text-foreground">Selected files ({files.length}/5)</h3>
                  <div className="space-y-2">
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted border border-border"
                      >
                        <div className="flex items-center gap-3">
                          <ImageIcon className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
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
                          <X className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Info */}
              <Callout tone="info" title="How it works">
                <ul className="space-y-1 list-disc list-inside">
                  <li>Upload screenshots of recipes from paywalled sites or cookbooks</li>
                  <li>AI vision will extract ingredients, instructions, and other details</li>
                  <li>You'll be able to review and edit the extracted recipe before saving</li>
                  <li>Supports up to 5 images if the recipe spans multiple screenshots</li>
                </ul>
              </Callout>
            </form>
          ) : (
            /* Recipe Preview */
            <div className="space-y-4">
              <Callout tone="success" title="Recipe extracted">
                <p>
                  Review the extracted recipe below. You can edit it before saving.
                </p>
                <p className="font-medium mt-2">
                  Saving will create a new recipe with {extractedRecipe.ingredients?.length || 0} ingredients
                  and {extractedRecipe.instructions?.length || 0} steps
                  {extractedRecipe.tags?.length ? `, tagged ${extractedRecipe.tags.join(', ')}` : ''}.
                </p>
              </Callout>

              <div className="space-y-4 border border-border rounded-lg p-4 bg-muted">
                <div>
                  <h3 className="text-base font-medium text-foreground">{extractedRecipe.title}</h3>
                  {extractedRecipe.description && (
                    <p className="leading-relaxed text-muted-foreground mt-1">{extractedRecipe.description}</p>
                  )}
                </div>

                {(extractedRecipe.servings || extractedRecipe.prepTime || extractedRecipe.cookTime) && (
                  <div className="flex gap-4 text-sm">
                    {extractedRecipe.servings && (
                      <div><span className="font-medium">Servings:</span> {extractedRecipe.servings}</div>
                    )}
                    {extractedRecipe.prepTime && (
                      <div><span className="font-medium">Prep:</span> {extractedRecipe.prepTime}min</div>
                    )}
                    {extractedRecipe.cookTime && (
                      <div><span className="font-medium">Cook:</span> {extractedRecipe.cookTime}min</div>
                    )}
                  </div>
                )}

                {extractedRecipe.ingredients && extractedRecipe.ingredients.length > 0 && (
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Ingredients</h4>
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
                    <h4 className="font-medium text-foreground mb-2">Instructions</h4>
                    <ol className="space-y-2 text-sm list-decimal list-inside">
                      {extractedRecipe.instructions.map((step, i) => (
                        <li key={i} className="text-muted-foreground">{step}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {extractedRecipe.tags && extractedRecipe.tags.length > 0 && (
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Tags</h4>
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
                className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                    Extracting
                  </>
                ) : (
                  <>
                    Extract recipe
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
                className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Saving' : 'Save recipe'}
              </button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
