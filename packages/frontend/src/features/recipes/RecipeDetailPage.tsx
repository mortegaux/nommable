import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Camera, Check, ChevronLeft, Clock, Download, FileText, Flame, Heart, Lightbulb, List, MoreVertical, Pencil, Printer, RefreshCw, Share2, Trash2, Users, UtensilsCrossed, ChefHat, Wand2, X, Plus, Tag as TagIcon } from 'lucide-react';
import { recipeApi, ratingApi, collectionApi, taxonomyApi } from '@/services/api';
import { useConfirmStore } from '@/store/confirm.store';
import { useToastStore } from '@/store/toast.store';
import { formatQuantity } from '@/utils/fractions';
import { CookingMode } from './CookingMode';
import { ServingScaler } from './ServingScaler';
import { AIEnhanceRecipeModal } from './AIEnhanceRecipeModal';
import { AIGenerateImageModal } from './AIGenerateImageModal';
import { AIConfigAlert } from '@/components/AIConfigAlert';
import { checkAIConfiguration, aiUnavailableMessage } from '@/utils/aiValidation';
import { useAIStatus, AISetupBadge } from '@/hooks/useAIStatus';
import { StarRating } from '@/components/StarRating';
import type { Recipe, Taxonomy } from '@nommable/shared';

const DIETARY_BADGES = {
  'Vegetarian': { color: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800' },
  'Vegan': { color: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800' },
  'Gluten-Free': { color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800' },
  'Dairy-Free': { color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800' },
  'Low-Carb': { color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-800' },
  'Keto': { color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-800' },
  'Paleo': { color: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 border-orange-200 dark:border-orange-800' },
  'Quick': { color: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800' },
  'One-Pot': { color: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800' },
  'Freezer-Friendly': { color: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-800 dark:text-cyan-200 border-cyan-200 dark:border-cyan-800' },
  'Kid-Friendly': { color: 'bg-pink-100 dark:bg-pink-900/40 text-pink-800 dark:text-pink-200 border-pink-200 dark:border-pink-800' },
  'Healthy': { color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800' },
};

const DIFFICULTY_CONFIG = {
  easy: { label: 'Easy', color: 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
  medium: { label: 'Medium', color: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
  hard: { label: 'Hard', color: 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
};

export default function RecipeDetailPage() {
  const confirm = useConfirmStore((s) => s.confirm);
  const toast = useToastStore();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [cookingMode, setCookingMode] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showEnhanceModal, setShowEnhanceModal] = useState(false);
  const [enhancementType, setEnhancementType] = useState<'improve_instructions' | 'add_tips' | 'optimize_ingredients'>('improve_instructions');
  const [showAIConfigAlert, setShowAIConfigAlert] = useState(false);
  const [aiAlertMessage, setAiAlertMessage] = useState<string | undefined>(undefined);
  const { isReady: aiReady, isLoading: aiLoading } = useAIStatus();
  const aiNeedsSetup = !aiReady && !aiLoading;
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [showGenerateImageModal, setShowGenerateImageModal] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);

  // Quick inline tag & category editor state
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [tagMode, setTagMode] = useState<'tag' | 'category'>('tag');
  const [taxonomyCategories, setTaxonomyCategories] = useState<string[]>([]);
  const [taxonomyTags, setTaxonomyTags] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  // Collapse long tag lists: show the most relevant first, tuck the rest
  // behind a "+N more" expander. Never deletes data.
  const [showAllTags, setShowAllTags] = useState(false);

  useEffect(() => {
    if (id) {
      loadRecipe(id);
    }
  }, [id]);

  useEffect(() => {
    taxonomyApi
      .getAll()
      .then((res) => {
        const items: Taxonomy[] = res.data;
        setTaxonomyCategories(items.filter((t) => t.type === 'category').map((t) => t.name));
        setTaxonomyTags(items.filter((t) => t.type === 'tag').map((t) => t.name));
      })
      .catch(() => {});
  }, []);

  const updateRecipeTagsAndCategories = async (nextTags: string[], nextCategories: string[]) => {
    if (!recipe) return;
    const prevTags = recipe.tags || [];
    const prevCategories = recipe.categories || [];
    setRecipe({ ...recipe, tags: nextTags, categories: nextCategories });
    setSavingTags(true);
    try {
      await recipeApi.update(recipe.id, {
        tags: nextTags,
        categories: nextCategories,
      });
    } catch (error) {
      console.error('Failed to update tags/categories:', error);
      setRecipe({ ...recipe, tags: prevTags, categories: prevCategories });
    } finally {
      setSavingTags(false);
    }
  };

  const handleAddInlineTagOrCategory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!recipe || !newTagInput.trim()) return;

    const entries = newTagInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (entries.length === 0) return;

    const currentTags = recipe.tags || [];
    const currentCategories = recipe.categories || [];

    if (tagMode === 'tag') {
      const existingLower = new Set(currentTags.map((t) => t.toLowerCase()));
      const additions = entries.filter((entry) => !existingLower.has(entry.toLowerCase()));
      if (additions.length > 0) {
        await updateRecipeTagsAndCategories([...currentTags, ...additions], currentCategories);
      }
    } else {
      const existingLower = new Set(currentCategories.map((c) => c.toLowerCase()));
      const additions = entries.filter((entry) => !existingLower.has(entry.toLowerCase()));
      if (additions.length > 0) {
        await updateRecipeTagsAndCategories(currentTags, [...currentCategories, ...additions]);
      }
    }
    setNewTagInput('');
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    if (!recipe) return;
    const nextTags = (recipe.tags || []).filter((t) => t !== tagToRemove);
    await updateRecipeTagsAndCategories(nextTags, recipe.categories || []);
  };

  const handleRemoveCategory = async (catToRemove: string) => {
    if (!recipe) return;
    const nextCategories = (recipe.categories || []).filter((c) => c !== catToRemove);
    await updateRecipeTagsAndCategories(recipe.tags || [], nextCategories);
  };

  const handleToggleQuickItem = async (item: string, mode: 'tag' | 'category') => {
    if (!recipe) return;
    const currentTags = recipe.tags || [];
    const currentCategories = recipe.categories || [];

    if (mode === 'tag') {
      const exists = currentTags.includes(item);
      const nextTags = exists ? currentTags.filter((t) => t !== item) : [...currentTags, item];
      await updateRecipeTagsAndCategories(nextTags, currentCategories);
    } else {
      const exists = currentCategories.includes(item);
      const nextCategories = exists
        ? currentCategories.filter((c) => c !== item)
        : [...currentCategories, item];
      await updateRecipeTagsAndCategories(currentTags, nextCategories);
    }
  };

  const loadRecipe = async (recipeId: string) => {
    try {
      const response = await recipeApi.getById(recipeId);
      setRecipe(response.data);
      setUserRating((response.data as { userRating?: number }).userRating ?? null);
      setIsFavorite((response.data as any).isFavorite ?? false);
    } catch (error) {
      console.error('Failed to load recipe:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRatingChange = async (rating: number | null) => {
    if (!recipe) return;
    const previous = userRating;
    setUserRating(rating);
    try {
      if (rating) {
        await ratingApi.rate(recipe.id, rating);
      } else {
        await ratingApi.unrate(recipe.id);
      }
    } catch (error) {
      console.error('Failed to update rating:', error);
      setUserRating(previous);
    }
  };

  const handleToggleFavorite = async () => {
    if (!recipe) return;
    try {
      const result = await collectionApi.toggleFavorite(recipe.id);
      setIsFavorite(result.isFavorite);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    const ok = await confirm({
      title: 'Delete recipe?',
      message: `Permanently delete "${recipe?.title ?? 'this recipe'}"? This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;

    try {
      await recipeApi.delete(id);
      toast.success('Recipe deleted.');
      navigate('/recipes');
    } catch (error) {
      console.error('Failed to delete recipe:', error);
      toast.error('Failed to delete recipe. Please try again.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportJson = () => {
    if (!recipe) return;

    // Create a clean export without IDs and timestamps
    const exportData = {
      title: recipe.title,
      description: recipe.description,
      servings: recipe.servings,
      prepTime: recipe.prepTime,
      cookTime: recipe.cookTime,
      difficulty: recipe.difficulty,
      imageUrl: recipe.imageUrl,
      sourceUrl: recipe.sourceUrl,
      notes: recipe.notes,
      ingredients: recipe.ingredients?.map(ing => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        notes: ing.notes,
        section: ing.section,
      })),
      instructions: recipe.instructions,
      categories: recipe.categories,
      tags: recipe.tags,
      nutrition: recipe.nutrition,
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recipe.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShareLink = () => {
    const shareLink = `${window.location.origin}/recipes/${id}`;
    navigator.clipboard.writeText(shareLink);
    toast.success('Share link copied to clipboard!');
  };

  const toggleIngredient = (ingredientId: string) => {
    setCheckedIngredients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ingredientId)) {
        newSet.delete(ingredientId);
      } else {
        newSet.add(ingredientId);
      }
      return newSet;
    });
  };

  const toggleStep = (stepIndex: number) => {
    setCheckedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepIndex)) {
        newSet.delete(stepIndex);
      } else {
        newSet.add(stepIndex);
      }
      return newSet;
    });
  };

  const handleImageUpload = async (file: File) => {
    if (!recipe) return;
    setUploadingImage(true);
    try {
      const response = await recipeApi.uploadImage(file, recipe.id);
      setRecipe(prev => (prev ? { ...prev, imageUrl: response.data.imageUrl } : prev));
      setShowImageUpload(false);
    } catch (error) {
      console.error('Failed to upload image:', error);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAIEnhanceClick = async (type: 'improve_instructions' | 'add_tips' | 'optimize_ingredients') => {
    const aiStatus = await checkAIConfiguration();

    if (!aiStatus.isConfigured || !aiStatus.isEnabled) {
      setAiAlertMessage(aiUnavailableMessage(aiStatus));
      setShowAIConfigAlert(true);
      setShowMenu(false);
      return;
    }

    setEnhancementType(type);
    setShowEnhanceModal(true);
    setShowMenu(false);
  };

  const handleOpenGenerateImage = async () => {
    const aiStatus = await checkAIConfiguration();
    if (!aiStatus.isConfigured || !aiStatus.isEnabled) {
      setAiAlertMessage(aiUnavailableMessage(aiStatus));
      setShowAIConfigAlert(true);
      setShowMenu(false);
      return;
    }
    setShowGenerateImageModal(true);
    setShowMenu(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading recipe...</div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="max-w-7xl mx-auto text-center py-12">
        <p className="text-destructive mb-4">Recipe not found</p>
        <Link to="/recipes" className="text-primary hover:underline">
          Back to recipes
        </Link>
      </div>
    );
  }

  const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);
  const difficulty = recipe.difficulty ? DIFFICULTY_CONFIG[recipe.difficulty] : null;
  const allRecipeTags = recipe.tags || [];
  // Deduplicate: hide tags that duplicate the difficulty pill (e.g. a "Medium" tag
  // alongside the Medium difficulty badge).
  const difficultyLabel = difficulty?.label?.toLowerCase();
  const visibleTags = difficultyLabel
    ? allRecipeTags.filter((tag) => tag.toLowerCase() !== difficultyLabel)
    : allRecipeTags;
  // Auto-generated "<Ingredient> Cuisine" tags (e.g. from AI imports) are noise
  // next to real tags — sort them last and render them de-emphasized.
  const isAutoCuisineTag = (tag: string) => /\bcuisine$/i.test(tag.trim());
  const sortedTags = [...visibleTags].sort((a, b) => {
    return Number(isAutoCuisineTag(a)) - Number(isAutoCuisineTag(b));
  });
  const TAG_COLLAPSE_LIMIT = 4;
  const displayedTags = showAllTags ? sortedTags : sortedTags.slice(0, TAG_COLLAPSE_LIMIT);
  const hiddenTagCount = sortedTags.length - displayedTags.length;
  const allAvailableTags = Array.from(new Set([...taxonomyTags, ...Object.keys(DIETARY_BADGES)]));
  const adjustedServings = (recipe.servings || 1) * servingMultiplier;

  // Render cooking mode if active
  if (cookingMode) {
    return (
      <CookingMode
        recipe={recipe}
        servingMultiplier={servingMultiplier}
        onExit={() => setCookingMode(false)}
      />
    );
  }

  return (
    <>
      {/* AI Config Alert */}
      {showAIConfigAlert && (
        <AIConfigAlert onClose={() => setShowAIConfigAlert(false)} message={aiAlertMessage} />
      )}

      {/* AI Enhancement Modal */}
      {showEnhanceModal && recipe && (
        <AIEnhanceRecipeModal
          recipeId={recipe.id}
          recipeTitle={recipe.title}
          enhancementType={enhancementType}
          onClose={() => setShowEnhanceModal(false)}
          onSuccess={() => {
            // Reload recipe to see changes
            if (id) loadRecipe(id);
          }}
        />
      )}

      <div className="max-w-7xl mx-auto pb-12">
      {/* Breadcrumb & Actions */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          to="/recipes"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          Back to recipes
        </Link>

        <div className="flex gap-2">
          {/* Primary action (PageHeader contract, issue #27): Cook is the
              one primary action on a recipe page; Share + kebab are quiet. */}
          <button
            onClick={() => setCookingMode(true)}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2"
            aria-label="Enter cooking mode"
          >
            <Clock className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            Cook
          </button>
          <button
            onClick={handleShareLink}
            className="px-4 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors flex items-center gap-2"
            aria-label="Copy share link"
            title="Copy share link"
          >
            <Share2 className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            Share
          </button>

          {/* Kebab Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="px-4 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors flex items-center"
              aria-label="More actions"
              aria-expanded={showMenu}
            >
              <MoreVertical className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            </button>

            {showMenu && (
              <>
                {/* Backdrop to close menu when clicking outside */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />

                {/* Dropdown Menu */}
                <div className="absolute right-0 mt-2 w-56 bg-card rounded-lg border border-border shadow-lg z-20 overflow-hidden">
                  <button
                    onClick={() => {
                      navigate(`/recipes/${id}/edit`);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left text-foreground hover:bg-accent transition-colors flex items-center gap-3"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    Edit recipe
                  </button>

                  <button
                    onClick={() => {
                      handleExportJson();
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left text-foreground hover:bg-accent transition-colors flex items-center gap-3"
                  >
                    <Download className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    Export as JSON
                  </button>

                  <button
                    onClick={() => {
                      handlePrint();
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left text-foreground hover:bg-accent transition-colors flex items-center gap-3"
                  >
                    <Printer className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    Print recipe
                  </button>

                  <div className="border-t border-border"></div>

                  {/* AI Enhancement Options */}
                  <div className="px-4 py-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      AI enhancements
                      {aiNeedsSetup && <AISetupBadge />}
                    </div>
                  </div>

                  <button
                    onClick={() => handleAIEnhanceClick('improve_instructions')}
                    className={`w-full px-4 py-3 text-left text-foreground hover:bg-accent transition-colors flex items-center gap-3 ${aiNeedsSetup ? 'opacity-60' : ''}`}
                  >
                    <FileText className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    Improve instructions
                  </button>

                  <button
                    onClick={() => handleAIEnhanceClick('add_tips')}
                    className={`w-full px-4 py-3 text-left text-foreground hover:bg-accent transition-colors flex items-center gap-3 ${aiNeedsSetup ? 'opacity-60' : ''}`}
                  >
                    <Lightbulb className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    Add cooking tips
                  </button>

                  <button
                    onClick={() => handleAIEnhanceClick('optimize_ingredients')}
                    className={`w-full px-4 py-3 text-left text-foreground hover:bg-accent transition-colors flex items-center gap-3 ${aiNeedsSetup ? 'opacity-60' : ''}`}
                  >
                    <RefreshCw className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    Optimize ingredients
                  </button>

                  <button
                    onClick={handleOpenGenerateImage}
                    className={`w-full px-4 py-3 text-left text-foreground hover:bg-accent transition-colors flex items-center gap-3 ${aiNeedsSetup ? 'opacity-60' : ''}`}
                  >
                    <Wand2 className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    Generate image
                  </button>

                  <div className="border-t border-border"></div>

                  <button
                    onClick={() => {
                      handleDelete();
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-3"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    Delete recipe
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Print-only compact header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">{recipe.title}</h1>
        {recipe.description && (
          <p className="text-sm text-muted-foreground mt-1">{recipe.description}</p>
        )}
        <div className="text-sm mt-1 text-muted-foreground">
          {recipe.servings && <span>Serves {adjustedServings}</span>}
          {recipe.prepTime && recipe.prepTime > 0 && <span> | Prep {recipe.prepTime}m</span>}
          {recipe.cookTime && recipe.cookTime > 0 && <span> | Cook {recipe.cookTime}m</span>}
          {totalTime > 0 && <span> | Total {totalTime}m</span>}
          {difficulty && <span> | {difficulty.label}</span>}
          {recipe.author && (
            <span>
              {' '}
              | Added by{' '}
              {recipe.author.firstName || recipe.author.lastName
                ? `${recipe.author.firstName || ''} ${recipe.author.lastName || ''}`.trim()
                : `@${recipe.author.username}`}
            </span>
          )}
        </div>
      </div>

      {/* Hero Image */}
      {recipe.imageUrl && (
        <div className="print:hidden">
          <div className="recipe-hero group relative w-full h-64 md:h-96 rounded-2xl overflow-hidden shadow-lg mb-2">
            <img
              src={recipe.imageUrl}
              alt={recipe.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

            {/* Title overlay on image */}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 text-white">
              <h1 className="text-3xl md:text-5xl font-bold leading-tight text-balance mb-2 drop-shadow-lg">{recipe.title}</h1>
              {recipe.description && (
                <p className="text-base md:text-lg text-white/90 drop-shadow max-w-3xl">{recipe.description}</p>
              )}
              {recipe.author && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-black/50 backdrop-blur-sm px-3 py-1 text-xs font-medium text-white/95 border border-white/15">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/80 text-[10px] font-medium text-primary-foreground flex-shrink-0 overflow-hidden">
                    {recipe.author.profilePhotoUrl ? (
                      <img
                        src={recipe.author.profilePhotoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (recipe.author.firstName && recipe.author.lastName
                        ? `${recipe.author.firstName[0]}${recipe.author.lastName[0]}`
                        : recipe.author.username.slice(0, 2)
                      ).toUpperCase()
                    )}
                  </span>
                  <span>
                    Added by{' '}
                    <span className="font-medium">
                      {recipe.author.firstName || recipe.author.lastName
                        ? `${recipe.author.firstName || ''} ${recipe.author.lastName || ''}`.trim()
                        : `@${recipe.author.username}`}
                    </span>
                  </span>
                </div>
              )}
            </div>

            {/* AI Badge */}
            {recipe.isAiGenerated && (
              <div className="absolute top-4 right-4 bg-accent/95 backdrop-blur-sm text-accent-foreground px-3 py-1.5 rounded-lg text-sm font-medium shadow-lg">
                AI Generated
              </div>
            )}

            {/* Action buttons overlay */}
            <div className="absolute top-4 left-4 md:top-4 md:left-auto md:right-4 flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleOpenGenerateImage}
                className="bg-black/60 hover:bg-black/80 text-white px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium"
                aria-label="Generate new image with AI"
                title={aiNeedsSetup ? 'Set up AI to generate photos' : 'Generate new image with AI'}
              >
                <span className="hidden sm:inline">AI Photo</span>
                {aiNeedsSetup && (
                  <span className="text-white/70">
                    Setup
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowImageUpload(prev => !prev)}
                className="bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg transition-colors"
                aria-label="Change recipe image"
                title="Change recipe image"
              >
                <Camera className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
          </div>

          {showImageUpload && (
            <div className="mt-2 p-4 border rounded-lg bg-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Change recipe image</span>
                <button onClick={() => setShowImageUpload(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                }}
                disabled={uploadingImage}
              />
              {uploadingImage && <p className="text-sm text-muted-foreground mt-2">Uploading</p>}
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Or generate photo with AI:</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowImageUpload(false);
                    handleOpenGenerateImage();
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  Generate with AI
                </button>
              </div>
            </div>
          )}

          <div className="mb-8" />
        </div>
      )}

      {/* Title if no image */}
      {!recipe.imageUrl && (
        <div className="mb-8 print:hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-5xl font-medium leading-tight text-balance text-foreground mb-3">{recipe.title}</h1>
              {recipe.description && (
                <p className="text-lg md:text-xl leading-relaxed text-muted-foreground">{recipe.description}</p>
              )}
              {recipe.author && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground border border-border">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary flex-shrink-0 overflow-hidden">
                    {recipe.author.profilePhotoUrl ? (
                      <img
                        src={recipe.author.profilePhotoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (recipe.author.firstName && recipe.author.lastName
                        ? `${recipe.author.firstName[0]}${recipe.author.lastName[0]}`
                        : recipe.author.username.slice(0, 2)
                      ).toUpperCase()
                    )}
                  </span>
                  <span>
                    Added by{' '}
                    <span className="font-medium text-foreground">
                      {recipe.author.firstName || recipe.author.lastName
                        ? `${recipe.author.firstName || ''} ${recipe.author.lastName || ''}`.trim()
                        : `@${recipe.author.username}`}
                    </span>
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 mt-2">
              <button
                onClick={handleOpenGenerateImage}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 text-sm font-medium transition-colors"
                aria-label="Generate image with AI"
                title="Generate image with AI"
              >
                <span>AI Photo</span>
              </button>
              <button
                onClick={() => setShowImageUpload(prev => !prev)}
                className="p-2 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Upload recipe image"
                title="Upload recipe image"
              >
                <Camera className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
          </div>

          {showImageUpload && (
            <div className="mt-4 p-4 border rounded-lg bg-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Add recipe image</span>
                <button onClick={() => setShowImageUpload(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                }}
                disabled={uploadingImage}
              />
              {uploadingImage && <p className="text-sm text-muted-foreground mt-2">Uploading</p>}
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Or generate photo with AI:</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowImageUpload(false);
                    handleOpenGenerateImage();
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  Generate with AI
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Meta Info Cards */}
      <div className="recipe-meta-cards grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 print:hidden">
        {recipe.servings && (
          <div className="bg-card rounded-xl border border-border p-4 text-center">
            <div className="mb-2 flex justify-center">
              <Users className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <div className="text-2xl font-medium font-mono tabular-nums text-foreground">{recipe.servings}</div>
            <div className="text-sm text-muted-foreground">Servings</div>
          </div>
        )}
        {recipe.prepTime && recipe.prepTime > 0 && (
          <div className="bg-card rounded-xl border border-border p-4 text-center">
            <div className="mb-2 flex justify-center">
              <ChefHat className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <div className="text-2xl font-medium font-mono tabular-nums text-foreground">{recipe.prepTime}m</div>
            <div className="text-sm text-muted-foreground">Prep time</div>
          </div>
        )}
        {recipe.cookTime && recipe.cookTime > 0 && (
          <div className="bg-card rounded-xl border border-border p-4 text-center">
            <div className="mb-2 flex justify-center">
              <Flame className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <div className="text-2xl font-medium font-mono tabular-nums text-foreground">{recipe.cookTime}m</div>
            <div className="text-sm text-muted-foreground">Cook time</div>
          </div>
        )}
        {totalTime > 0 && (
          <div className="bg-card rounded-xl border border-border p-4 text-center">
            <div className="mb-2 flex justify-center">
              <Clock className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <div className="text-2xl font-medium font-mono tabular-nums text-foreground">{totalTime}m</div>
            <div className="text-sm text-muted-foreground">Total time</div>
          </div>
        )}
      </div>

      {/* Tags, Categories & Difficulty */}
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {difficulty && (
            <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium border ${difficulty.color}`}>
              {difficulty.label}
            </span>
          )}
          {recipe.categories?.map(cat => (
            <span
              key={`cat-${cat}`}
              className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-primary/15 text-primary border border-primary/30"
            >
              <span>{cat}</span>
              <button
                type="button"
                onClick={() => handleRemoveCategory(cat)}
                disabled={savingTags}
                className="opacity-60 hover:opacity-100 hover:text-destructive transition-opacity print:hidden"
                title={`Remove category "${cat}"`}
                aria-label={`Remove category ${cat}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {displayedTags.map(tag => {
            const badge = DIETARY_BADGES[tag as keyof typeof DIETARY_BADGES];
            const isAuto = !badge && isAutoCuisineTag(tag);
            const colorClass = badge
              ? badge.color
              : isAuto
                ? 'bg-muted/50 text-muted-foreground border-border/50 text-xs opacity-80'
                : 'bg-muted text-foreground border-border';
            return (
              <span
                key={`tag-${tag}`}
                className={`group inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${colorClass}`}
              >
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  disabled={savingTags}
                  className="opacity-60 hover:opacity-100 hover:text-destructive transition-opacity print:hidden p-0.5 -m-0.5"
                  title={`Remove tag "${tag}"`}
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          {hiddenTagCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllTags(true)}
              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-accent/50 transition-colors"
              aria-label={`Show ${hiddenTagCount} more tags`}
            >
              +{hiddenTagCount} more
            </button>
          )}
          {showAllTags && sortedTags.length > TAG_COLLAPSE_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAllTags(false)}
              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-accent/50 transition-colors"
            >
              Show less
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowTagEditor(prev => !prev)}
            className="print:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-accent/50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            <span>{showTagEditor ? 'Done' : 'Add tag'}</span>
          </button>
        </div>

        {/* Inline Quick Tag & Category Editor */}
        {showTagEditor && (
          <div className="mt-3 p-4 rounded-xl border border-border bg-card shadow-sm print:hidden space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TagIcon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                <span className="text-sm font-medium text-foreground">Quick add tags & categories</span>
                {savingTags && <span className="text-xs text-muted-foreground">(Saving)</span>}
              </div>
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
                <button
                  type="button"
                  onClick={() => setTagMode('tag')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    tagMode === 'tag'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Tags
                </button>
                <button
                  type="button"
                  onClick={() => setTagMode('category')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    tagMode === 'category'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Categories
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddInlineTagOrCategory();
                  }
                }}
                placeholder={tagMode === 'tag' ? 'Type a custom tag, press Enter' : 'Type a category, press Enter'}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => handleAddInlineTagOrCategory()}
                disabled={!newTagInput.trim() || savingTags}
                className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Add
              </button>
            </div>

            {tagMode === 'tag' ? (
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">Click to toggle tags:</div>
                <div className="flex flex-wrap gap-1.5">
                  {allAvailableTags.map((tag) => {
                    const isSelected = (recipe.tags || []).some(t => t.toLowerCase() === tag.toLowerCase());
                    return (
                      <button
                        key={tag}
                        type="button"
                        disabled={savingTags}
                        onClick={() => handleToggleQuickItem(tag, 'tag')}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/60 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">Click to toggle categories:</div>
                <div className="flex flex-wrap gap-1.5">
                  {taxonomyCategories.map((cat) => {
                    const isSelected = (recipe.categories || []).some(c => c.toLowerCase() === cat.toLowerCase());
                    return (
                      <button
                        key={cat}
                        type="button"
                        disabled={savingTags}
                        onClick={() => handleToggleQuickItem(cat, 'category')}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/60 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rating & Favorite Controls */}
      <div className="flex items-center gap-2 mb-8 print:hidden">
        <StarRating rating={userRating} onChange={handleRatingChange} />
        <button
          onClick={handleToggleFavorite}
          className="p-2.5 -m-1 hover:text-primary transition-colors rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={isFavorite}
        >
          <Heart className={`h-6 w-6 ${isFavorite ? 'fill-primary text-primary' : ''}`} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Ingredients Section */}
        <div className="lg:col-span-1">
          <div className="recipe-ingredients bg-card rounded-2xl border border-border p-6 shadow-sm sticky top-4">
            <h2 className="text-xl font-medium text-foreground flex items-center gap-2 mb-4">
              <UtensilsCrossed className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
              Ingredients
            </h2>
            {/* Scaler is its own block inside the ingredients section
                (heading → scaler → list), not wedged beside the heading. */}
            {recipe.servings && (
              <ServingScaler
                servings={recipe.servings}
                multiplier={servingMultiplier}
                onMultiplierChange={setServingMultiplier}
              />
            )}

            <ul className="space-y-3">
              {recipe.ingredients?.map((ing) => {
                const adjustedQuantity = ing.quantity ? ing.quantity * servingMultiplier : undefined;
                const isChecked = checkedIngredients.has(ing.id);

                return (
                  <li key={ing.id}>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleIngredient(ing.id)}
                        className="mt-1 h-5 w-5 rounded border border-border cursor-pointer focus:ring-2 focus:ring-primary"
                      />
                      <span className={`flex-1 ${isChecked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        <span className="font-semibold tabular-nums text-primary">
                          {formatQuantity(adjustedQuantity, ing.unit)}
                          {adjustedQuantity && ' '}
                          {ing.unit && `${ing.unit} `}
                        </span>
                        <span className="font-medium">{ing.name}</span>
                        {ing.notes && (
                          <span className="block text-sm text-muted-foreground mt-0.5">
                            {ing.notes}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Instructions Section */}
        <div className="lg:col-span-2">
          <div className="recipe-instructions bg-card rounded-2xl border border-border p-6 md:p-8 shadow-sm">
            <h2 className="text-xl font-medium text-foreground mb-6 flex items-center gap-2">
              <List className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
              Instructions
            </h2>

            <ol className="space-y-6">
              {recipe.instructions?.map((instruction, index) => {
                const isChecked = checkedSteps.has(index);

                return (
                  <li key={index} className="flex gap-4 group">
                    <div className="flex-shrink-0">
                      <span className="step-number-print hidden font-bold mr-1">{index + 1}.</span>
                      <button
                        onClick={() => toggleStep(index)}
                        className={`step-circle h-10 w-10 rounded-full font-medium text-lg flex items-center justify-center transition-colors ${
                          isChecked
                            ? 'bg-secondary text-secondary-foreground'
                            : 'bg-primary text-primary-foreground'
                        }`}
                        aria-label={`Mark step ${index + 1} as ${isChecked ? 'incomplete' : 'complete'}`}
                      >
                        {isChecked ? <Check className="h-5 w-5" strokeWidth={2} aria-hidden="true" /> : index + 1}
                      </button>
                    </div>
                    <div className="flex-1 pt-1.5">
                      <p className={`text-base leading-relaxed ${isChecked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {instruction}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Additional Info */}
          {(recipe.notes || recipe.sourceUrl) && (
            <div className="mt-6 bg-muted rounded-2xl border border-border p-6">
              {recipe.notes && (
                <div className="mb-4">
                  <h3 className="text-base font-medium text-foreground mb-2 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                    Notes
                  </h3>
                  <p className="leading-relaxed text-muted-foreground">{recipe.notes}</p>
                </div>
              )}
              {recipe.sourceUrl && (
                <div>
                  <h3 className="text-base font-medium text-foreground mb-2">Source</h3>
                  <a
                    href={recipe.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {recipe.sourceUrl}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Print footer - only visible when printing */}
      <div className="hidden print:block mt-8 pt-4 border-t text-xs text-gray-500">
        {recipe.sourceUrl && <p>Source: {recipe.sourceUrl}</p>}
        <p>Printed from Nommable on {new Date().toLocaleDateString()}</p>
      </div>
    </div>

    {showGenerateImageModal && recipe && (
      <AIGenerateImageModal
        isOpen={showGenerateImageModal}
        onClose={() => setShowGenerateImageModal(false)}
        recipeId={recipe.id}
        recipeTitle={recipe.title}
        recipeDescription={recipe.description}
        recipeCuisine={recipe.categories?.[0]}
        onImageGenerated={(imageUrl) => {
          setRecipe((prev: Recipe | null) => prev ? { ...prev, imageUrl } : prev);
        }}
      />
    )}
    </>
  );
}
