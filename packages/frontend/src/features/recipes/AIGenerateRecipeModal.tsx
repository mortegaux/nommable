import { useState, useRef } from 'react';
import { aiErrorMessage } from '@/utils/aiValidation';
import { useNavigate } from 'react-router-dom';
import { useToastStore } from '@/store/toast.store';
import { useAuthStore } from '@/store/auth.store';
import { recipeApi } from '@/services/api';
import { Camera, Image as ImageIcon, Loader2, X } from 'lucide-react';
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
    <Dialog title="Generate recipe with AI" onClose={onClose}>
      <div className="p-6">

          {/* Tabs */}
          <div className="flex gap-2" role="tablist" aria-label="Generation method">
            <button
              type="button"
              onClick={() => setActiveTab('describe')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'describe'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-background border border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
              }`}
            >
              Describe recipe
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('photo')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'photo'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-background border border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
              }`}
            >
              <Camera className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              Use photo
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
                  <div className="flex flex-col items-center justify-center w-full h-64 border border-dashed border-border rounded-lg bg-background">
                    <Camera className="h-12 w-12 text-muted-foreground mb-3" strokeWidth={1.5} aria-hidden="true" />
                    <div className="flex gap-3">
                      <label
                        htmlFor="photo-capture"
                        className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                      >
                        <Camera className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                        Take Photo
                      </label>
                      <label
                        htmlFor="photo-gallery"
                        className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm font-medium hover:bg-accent transition-colors"
                      >
                        <ImageIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
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
                      <Loader2 className="h-5 w-5 animate-spin text-primary" strokeWidth={1.5} aria-hidden="true" />
                      <span className="text-sm font-medium text-foreground">AI is detecting ingredients</span>
                    </div>
                  )}

                  {detectedIngredients.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-foreground">
                          Detected ingredients ({detectedIngredients.length})
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
                              <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
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
                          placeholder="Add ingredient manually"
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
              placeholder={activeTab === 'photo' ? "E.g., Stir-fry, pasta dish, salad" : "E.g., A healthy chicken stir-fry with vegetables, or creamy pasta with mushrooms and spinach"}
              required
            />
            {activeTab === 'describe' && (
              <p className="text-xs text-muted-foreground mt-1">
                Describe the type of recipe you want — be as specific or general as you like.
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
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
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
              Generate an AI photo for this recipe
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
            className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                Generating
              </>
            ) : (
              <>
                Generate recipe
              </>
            )}
          </button>
        </div>
    </Dialog>
  );
}
