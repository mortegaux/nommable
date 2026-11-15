import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { recipeApi } from '@/services/api';
import { AlertTriangle, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { Callout } from '@/components/Callout';
import { Dialog } from '@/components/Dialog';
import { compressImages } from '@/utils/compressImage';
import type { RecipeCreateDto } from '@nommable/shared';

interface RecipeImportExportProps {
  onClose: () => void;
}

export function RecipeImportExport({ onClose }: RecipeImportExportProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'import-url' | 'import-text' | 'import-image-pdf'>('import-url');
  const [url, setUrl] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Extracted recipe preview state (shared by Paste Text and Image/PDF extraction)
  const [files, setFiles] = useState<File[]>([]);
  const [extractedRecipe, setExtractedRecipe] = useState<RecipeCreateDto | null>(null);

  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setError('Please enter a recipe URL');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await recipeApi.importFromUrl(url);
      navigate(`/recipes/${response.data.id}`);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to import recipe. Make sure the URL is valid.');
    } finally {
      setLoading(false);
    }
  };

  const handleExtractText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim()) {
      setError('Please paste recipe text to extract');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await recipeApi.extractFromText(pastedText);
      setExtractedRecipe(response.data);
    } catch (err: any) {
      console.error('Failed to extract recipe from text:', err);
      setError(err.response?.data?.error || 'Failed to parse recipe text. Please check the text and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).slice(0, 5); // Max 5 files
      const compressed = await compressImages(selectedFiles);
      setFiles(compressed);
      setError('');
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();

    if (files.length === 0) {
      setError('Please select at least one image or PDF file');
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
    if (activeTab === 'import-image-pdf') {
      setFiles([]);
    }
    setError('');
  };


  return (
    <Dialog title="Import recipes" onClose={onClose}>
      <div className="p-6">
          {/* Tabs */}
          <div className="flex gap-2 flex-wrap mb-6" role="tablist" aria-label="Import method">
            <button
              onClick={() => {
                setActiveTab('import-url');
                setExtractedRecipe(null);
                setError('');
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'import-url'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              Import from URL
            </button>
            <button
              onClick={() => {
                setActiveTab('import-text');
                setExtractedRecipe(null);
                setError('');
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'import-text'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              Paste text
            </button>
            <button
              onClick={() => {
                setActiveTab('import-image-pdf');
                setError('');
                setExtractedRecipe(null);
                setFiles([]);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'import-image-pdf'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              Image extract
            </button>
          </div>

          {/* Content */}
          {error && (
            <div className="mb-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
              {error}
            </div>
          )}

          {/* Import from URL */}
          {activeTab === 'import-url' && (
            <form onSubmit={handleImportUrl} className="space-y-4">
              <div>
                <p className="leading-relaxed text-muted-foreground mb-4">
                  Import recipes from popular cooking websites. Just paste the recipe URL below.
                </p>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Supported sites:</p>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                    <li>• AllRecipes.com</li>
                    <li>• FoodNetwork.com</li>
                    <li>• BonAppetit.com</li>
                    <li>• SeriousEats.com</li>
                    <li>• ...and many more</li>
                  </ul>
                </div>
              </div>

              <div>
                <label htmlFor="url" className="block text-sm font-medium text-foreground mb-2">
                  Recipe URL
                </label>
                <input
                  id="url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/recipes/chocolate-chip-cookies"
                  className="w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Importing' : 'Import recipe'}
              </button>
            </form>
          )}

          {/* Paste Unformatted Recipe Text */}
          {activeTab === 'import-text' && !extractedRecipe && (
            <form onSubmit={handleExtractText} className="space-y-4">
              <div>
                <p className="leading-relaxed text-muted-foreground mb-2">
                  Copy and paste unformatted or poorly formatted text from any website, blog post, email, or document. Nommable will automatically parse out the title, ingredients, quantities, and step-by-step instructions.
                </p>
              </div>

              <div>
                <label htmlFor="recipe-text" className="block text-sm font-medium text-foreground mb-2">
                  Recipe text
                </label>
                <textarea
                  id="recipe-text"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`Paste any raw recipe text here\n\nExample:\nHomemade Sloppy Joes\nPrep: 10 mins | Cook: 20 mins | Serves: 6\n\nIngredients:\n1 lb lean ground beef\n1/2 medium yellow onion, diced\n3/4 cup ketchup\n1 tbsp brown sugar\n1 tsp yellow mustard\n\nInstructions:\n1. Brown the ground beef and onion in a skillet over medium-high heat; drain excess fat.\n2. Stir in ketchup, brown sugar, and mustard.\n3. Simmer on low for 10 minutes until thickened, then serve on toasted buns.`}
                  rows={12}
                  className="w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !pastedText.trim()}
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                    Parsing recipe
                  </>
                ) : (
                  <>
                    Generate recipe from text
                  </>
                )}
              </button>
            </form>
          )}

          {/* AI Extract from Images */}
          {activeTab === 'import-image-pdf' && !extractedRecipe && (
            <form onSubmit={handleExtract} className="space-y-6">
              {/* Cost Warning */}
              <Callout tone="warning" title="AI vision cost notice" icon={<AlertTriangle className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />}>
                <p>
                  Extracting recipes from images uses AI vision models, which have higher costs than text-only AI features.
                  Each image processed will consume AI tokens.
                </p>
              </Callout>

              {/* File Upload */}
              <div>
                <label htmlFor="files" className="block text-sm font-medium text-foreground mb-2">
                  Select images <span className="text-destructive">*</span>
                </label>
                <input
                  id="files"
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  capture="environment"
                  onChange={handleFileChange}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                  required
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Supported formats: PNG, JPG, WebP • Maximum 5 files • Auto-compressed for upload
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
                  <li>Review the extracted recipe before saving (you can edit it after)</li>
                  <li>Supports up to 5 images if the recipe spans multiple screenshots</li>
                </ul>
              </Callout>

              <button
                type="submit"
                disabled={loading || files.length === 0}
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
            </form>
          )}

          {/* Recipe Preview */}
          {(activeTab === 'import-text' || activeTab === 'import-image-pdf') && extractedRecipe && (
            <div className="space-y-4">
              <Callout tone="success" title="Recipe extracted">
                <p>
                  Review the extracted recipe below. You can edit it after saving.
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

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={loading}
                  className="flex-1 py-3 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleSaveRecipe}
                  disabled={loading}
                  className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Saving' : 'Save recipe'}
                </button>
              </div>
            </div>
          )}
      </div>
    </Dialog>
  );
}
