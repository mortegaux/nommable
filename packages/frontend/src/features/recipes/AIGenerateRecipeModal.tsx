import { useState, useRef } from 'react';
import { aiErrorMessage } from '@/utils/aiValidation';
import { useNavigate } from 'react-router-dom';
import { useToastStore } from '@/store/toast.store';
import { useAuthStore } from '@/store/auth.store';
import { recipeApi } from '@/services/api';
import { AutoAwesomeIcon } from '@/components/icons/MaterialIcon';
import { Dialog } from '@/components/Dialog';
import { compressImage } from '@/utils/compressImage';
import type { AIGenerateRecipeRequest } from '@nommable/shared';

interface AIGenerateRecipeModalProps {
  onClose: () => void;
}

const DIETARY_OPTIONS = [
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Dairy-Free',
  'Low-Carb',
  'Keto',
  'Paleo',
];

const CUISINE_OPTIONS = [
  'Italian',
  'Chinese',
  'Mexican',
  'Indian',
  'Japanese',
  'Thai',
  'French',
  'Mediterranean',
  'American',
  'Korean',
];

type TabType = 'describe' | 'photo';

export function AIGenerateRecipeModal({ onClose }: AIGenerateRecipeModalProps) {
  const navigate = useNavigate();
  const toast = useToastStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('describe');

  const [prompt, setPrompt] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [dietary, setDietary] = useState<string[]>([]);
  const [cuisine, setCuisine] = useState('');
  const [servings, setServings] = useState(4);
  const [generateImage, setGenerateImage] = useState(true);

  // Photo tab state
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [detectedIngredients, setDetectedIngredients] = useState<string[]>([]);
  const [newIngredient, setNewIngredient] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview immediately
    setDetectedIngredients([]);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Compress image if it's large (>2MB) for better upload performance
    try {
      const compressed = await compressImage(file);
      setSelectedImage(compressed);
    } catch (err) {
      console.warn('Image compression failed, using original:', err);
      setSelectedImage(file);
    }
  };

  const handleAnalyzePhoto = async () => {
    if (!selectedImage) return;

    setAnalyzing(true);
    setError('');

    try {
      console.log('Analyzing image:', {
        name: selectedImage.name,
        size: `${(selectedImage.size / 1024 / 1024).toFixed(2)}MB`,
        type: selectedImage.type,
      });

      const response = await recipeApi.detectIngredientsFromImage(selectedImage);
      setDetectedIngredients(response.data.ingredients);

      // Update ingredients field with detected ingredients
      setIngredients(response.data.ingredients.join(', '));

      // Ingredient detection is a metered AI generation — refresh the
      // credits badge so it stays accurate without a page reload.
      await useAuthStore.getState().refreshUser();
    } catch (err: any) {
      console.error('Failed to detect ingredients:', err);
      console.error('Error details:', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        message: err.message,
      });

      // Show more detailed error message
      let errorMsg = 'Failed to detect ingredients. ';
      if (err.response?.status === 413) {
        errorMsg += 'Image file is too large. Try taking a photo at lower resolution.';
      } else if (err.response?.status === 400) {
        errorMsg += err.response?.data?.error || 'Invalid image file.';
      } else if (err.response?.status === 401) {
        errorMsg += 'Please log in again.';
      } else if (err.message?.includes('Network Error')) {
        errorMsg += 'Network error. Please check your connection.';
      } else {
        errorMsg += aiErrorMessage(err, 'Please check your AI configuration.');
      }
      setError(errorMsg);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRemoveIngredient = (ingredient: string) => {
    const updated = detectedIngredients.filter(i => i !== ingredient);
    setDetectedIngredients(updated);
    setIngredients(updated.join(', '));
  };

  const handleAddIngredient = () => {
    if (!newIngredient.trim()) return;

    const updated = [...detectedIngredients, newIngredient.trim()];
    setDetectedIngredients(updated);
    setIngredients(updated.join(', '));
    setNewIngredient('');
  };

  const handleRetakePhoto = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setDetectedIngredients([]);
    setIngredients('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prompt.trim()) {
      setError('Please enter a recipe description');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const requestData: AIGenerateRecipeRequest = {
        prompt: prompt.trim(),
        ...(ingredients.trim() && { ingredients: ingredients.split(',').map(i => i.trim()) }),
        ...(dietary.length > 0 && { dietary }),
        ...(cuisine && { cuisine }),
        servings,
        generateImage,
      };

      const response = await recipeApi.generateWithAI(requestData);
      const recipeId = response.data.id;

      // The recipe is created even when its auto-image fails — the backend
      // reports that as imageError instead of failing the whole request.
      // Surface it honestly rather than landing on a recipe that silently
      // has no image.
      const imageError = (response.data as unknown as { imageError?: string }).imageError;
      if (imageError) {
        toast.error(`Recipe created, but the image could not be generated: ${imageError}`);
      }

      // A successful generation may have consumed a credit — refresh the
      // badge before navigating so it shows the true balance.
      await useAuthStore.getState().refreshUser();

      // Close modal and navigate to the new recipe
      onClose();
      navigate(`/recipes/${recipeId}`);
    } catch (err: any) {
      console.error('Failed to generate recipe:', err);
      setError(aiErrorMessage(err, 'Failed to generate recipe. Please check your AI configuration.'));
    } finally {
      setLoading(false);
    }
  };

  const toggleDietary = (option: string) => {
    setDietary(prev =>
      prev.includes(option)
        ? prev.filter(d => d !== option)
        : [...prev, option]
    );
  };

  return (
    <Dialog title="Generate Recipe with AI" onClose={onClose} panelClassName="max-w-2xl">
      <div className="p-6">

          {/* Tabs */}
          <div className="flex gap-2" role="tablist" aria-label="Generation method">
            <button
              type="button"
              onClick={() => setActiveTab('describe')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'describe'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-background border border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
              }`}
            >
              Describe Recipe
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('photo')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'photo'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-background border border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Use Photo
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
              {error}
            </div>
          )}

          {/* Photo Tab Content */}
          {activeTab === 'photo' && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Take a photo or choose from your gallery and AI will detect your ingredients
              </div>

              {!imagePreview ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageSelect}
                    className="hidden"
                    id="photo-capture"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                    id="photo-gallery"
                  />
                  <div className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-border rounded-lg bg-background">
                    <svg className="w-12 h-12 text-muted-foreground mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <div className="flex gap-3">
                      <label
                        htmlFor="photo-capture"
                        className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Take Photo
                      </label>
                      <label
                        htmlFor="photo-gallery"
                        className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm font-medium hover:bg-accent transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Choose from Gallery
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">All image formats supported • Auto-compressed for upload</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Selected ingredients"
                      className="w-full h-64 object-cover rounded-lg"
                    />
                  </div>

                  {!analyzing && detectedIngredients.length === 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleRetakePhoto}
                        className="flex-1 px-4 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors"
                      >
                        Retake
                      </button>
                      <button
                        type="button"
                        onClick={handleAnalyzePhoto}
                        className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                      >
                        Analyze Photo
                      </button>
                    </div>
                  )}

                  {analyzing && (
                    <div className="flex items-center justify-center gap-3 p-4 bg-accent rounded-lg">
                      <svg className="animate-spin h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="text-sm font-medium text-foreground">AI is detecting ingredients...</span>
                    </div>
                  )}

                  {detectedIngredients.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-foreground">
                          Detected Ingredients ({detectedIngredients.length})
                        </label>
                        <button
                          type="button"
                          onClick={handleRetakePhoto}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Retake Photo
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {detectedIngredients.map((ingredient, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm"
                          >
                            <span>{ingredient}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveIngredient(ingredient)}
                              className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newIngredient}
                          onChange={(e) => setNewIngredient(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddIngredient())}
                          placeholder="Add ingredient manually..."
                          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <button
                          type="button"
                          onClick={handleAddIngredient}
                          disabled={!newIngredient.trim()}
                          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Recipe Prompt (shown for both tabs) */}
          <div>
            <label htmlFor="prompt" className="block text-sm font-medium text-foreground mb-2">
              {activeTab === 'describe' ? 'What would you like to cook?' : 'Recipe description'} <span className="text-destructive">*</span>
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={activeTab === 'describe' ? 3 : 2}
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={activeTab === 'photo' ? "E.g., Stir-fry, pasta dish, salad..." : "E.g., A healthy chicken stir-fry with vegetables, or Creamy pasta with mushrooms and spinach..."}
              required
            />
            {activeTab === 'describe' && (
              <p className="text-xs text-muted-foreground mt-1">
                Describe the type of recipe you want - be as specific or general as you like!
              </p>
            )}
          </div>

          {/* Ingredients (describe tab only — photo tab uses detected ingredients) */}
          {activeTab === 'describe' && (
            <div>
              <label htmlFor="ingredients" className="block text-sm font-medium text-foreground mb-2">
                Ingredients you have (optional)
              </label>
              <input
                id="ingredients"
                type="text"
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="E.g., chicken, broccoli, garlic, soy sauce"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Comma-separated list of ingredients to prioritize
              </p>
            </div>
          )}

          {/* Servings */}
          <div>
            <label htmlFor="servings" className="block text-sm font-medium text-foreground mb-2">
              Number of servings
            </label>
            <input
              id="servings"
              type="number"
              min="1"
              max="20"
              value={servings}
              onChange={(e) => setServings(parseInt(e.target.value) || 4)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Dietary Requirements */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Dietary requirements (optional)
            </label>
            <div className="flex flex-wrap gap-2">
              {DIETARY_OPTIONS.map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleDietary(option)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    dietary.includes(option)
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-background border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* Cuisine */}
          <div>
            <label htmlFor="cuisine" className="block text-sm font-medium text-foreground mb-2">
              Cuisine style (optional)
            </label>
            <select
              id="cuisine"
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Any cuisine</option>
              {CUISINE_OPTIONS.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          {/* AI Image Generation Option */}
          <div className="flex items-center gap-2 pt-2">
            <input
              id="generate-image-checkbox"
              type="checkbox"
              checked={generateImage}
              onChange={(e) => setGenerateImage(e.target.checked)}
              className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-primary cursor-pointer"
            />
            <label htmlFor="generate-image-checkbox" className="text-sm font-medium text-foreground flex items-center gap-1.5 cursor-pointer">
              <AutoAwesomeIcon size={14} className="text-primary" />
              Generate an AI culinary photograph for this recipe
            </label>
          </div>
        </form>

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
            onClick={handleSubmit}
            disabled={loading || !prompt.trim()}
            className="px-6 py-2 rounded-lg border border-border bg-background font-medium text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              <>
                <AutoAwesomeIcon size={18} />
                Generate Recipe
              </>
            )}
          </button>
        </div>
    </Dialog>
  );
}
