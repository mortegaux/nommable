import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { recipeApi, taxonomyApi } from '@/services/api';
import { fractionToDecimal } from '@/utils/fractions';
import type { Recipe, Taxonomy } from '@nommable/shared';
import { DescriptionIcon, RestaurantIcon, ListIcon, SettingsIcon } from '@/components/icons/MaterialIcon';
import { ImageUpload } from '@/components/ImageUpload';
import { useAuthStore } from '@/store/auth.store';
import { useConfirmStore } from '@/store/confirm.store';

interface Ingredient {
  name: string;
  quantity: string;
  unit: string;
  notes?: string;
  section?: string;
}

interface RecipeFormData {
  title: string;
  description: string;
  servings: number;
  prepTime: number;
  cookTime: number;
  difficulty: 'easy' | 'medium' | 'hard';
  imageUrl?: string;
  sourceUrl?: string;
  notes?: string;
  ingredients: Ingredient[];
  instructions: string[];
  categories: string[];
  tags: string[];
  nutrition?: {
    calories?: number;
    protein?: number;
    carbohydrates?: number;
    fat?: number;
  };
}

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy', description: 'Simple steps, basic skills' },
  { value: 'medium', label: 'Medium', description: 'Some experience needed' },
  { value: 'hard', label: 'Hard', description: 'Advanced techniques' },
];

const COMMON_UNITS = ['cup', 'tbsp', 'tsp', 'oz', 'lb', 'g', 'kg', 'ml', 'l', 'piece', 'clove', 'pinch', 'dash', 'whole'];


interface FormFieldError {
  tab: 'basics' | 'ingredients' | 'instructions' | 'details';
  fieldId: string;
  message: string;
}

interface RecipeFormProps {
  recipeId?: string; // If provided, form is in edit mode
}

export default function RecipeForm({ recipeId }: RecipeFormProps) {
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [loading, setLoading] = useState(false);
  // Re-entry guard: setLoading is async, so a rapid double-submit can fire
  // two requests before the button disables. This ref blocks the second one.
  const submittingRef = useRef(false);
  const [loadingRecipe, setLoadingRecipe] = useState(!!recipeId);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'basics' | 'ingredients' | 'instructions' | 'details'>('basics');
  const [taxonomyCategories, setTaxonomyCategories] = useState<string[]>([]);
  const [taxonomyTags, setTaxonomyTags] = useState<string[]>([]);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [customTagInput, setCustomTagInput] = useState('');

  const confirm = useConfirmStore((s) => s.confirm);
  const initialDataRef = useRef<RecipeFormData | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FormFieldError[]>([]);

  const [formData, setFormData] = useState<RecipeFormData>({
    title: '',
    description: '',
    servings: 4,
    prepTime: 15,
    cookTime: 30,
    difficulty: 'medium',
    ingredients: [{ name: '', quantity: '', unit: 'cup' }],
    instructions: [''],
    categories: [],
    tags: [],
  });

  // Load taxonomies
  useEffect(() => {
    taxonomyApi.getAll().then((res) => {
      const items: Taxonomy[] = res.data;
      setTaxonomyCategories(items.filter((t) => t.type === 'category').map((t) => t.name));
      setTaxonomyTags(items.filter((t) => t.type === 'tag').map((t) => t.name));
    }).catch(() => {
      // Fallback silently — form still works with empty lists
    });
  }, []);

  // Load recipe data if editing
  useEffect(() => {
    if (recipeId) {
      loadRecipe(recipeId);
    } else {
      initialDataRef.current = {
        title: '',
        description: '',
        servings: 4,
        prepTime: 15,
        cookTime: 30,
        difficulty: 'medium',
        ingredients: [{ name: '', quantity: '', unit: 'cup' }],
        instructions: [''],
        categories: [],
        tags: [],
      };
    }
  }, [recipeId]);

  const loadRecipe = async (id: string) => {
    try {
      setLoadingRecipe(true);
      const response = await recipeApi.getById(id);
      const recipe: Recipe = response.data;

      // Convert recipe to form data
      setFormData({
        title: recipe.title || '',
        description: recipe.description || '',
        servings: recipe.servings || 4,
        prepTime: recipe.prepTime || 15,
        cookTime: recipe.cookTime || 30,
        difficulty: recipe.difficulty || 'medium',
        imageUrl: recipe.imageUrl,
        sourceUrl: recipe.sourceUrl,
        notes: recipe.notes,
        ingredients: recipe.ingredients && recipe.ingredients.length > 0
          ? recipe.ingredients.map(ing => ({
              name: ing.name || '',
              quantity: ing.quantity?.toString() || '',
              unit: ing.unit || 'cup',
              notes: ing.notes,
              section: ing.section,
            }))
          : [{ name: '', quantity: '', unit: 'cup' }],
        instructions: recipe.instructions && recipe.instructions.length > 0
          ? recipe.instructions
          : [''],
        categories: recipe.categories || [],
        tags: recipe.tags || [],
        nutrition: recipe.nutrition,
      });
      initialDataRef.current = {
        title: recipe.title || '',
        description: recipe.description || '',
        servings: recipe.servings || 4,
        prepTime: recipe.prepTime || 15,
        cookTime: recipe.cookTime || 30,
        difficulty: recipe.difficulty || 'medium',
        imageUrl: recipe.imageUrl,
        sourceUrl: recipe.sourceUrl,
        notes: recipe.notes,
        ingredients: recipe.ingredients && recipe.ingredients.length > 0
          ? recipe.ingredients.map(ing => ({
              name: ing.name || '',
              quantity: ing.quantity?.toString() || '',
              unit: ing.unit || 'cup',
              notes: ing.notes,
              section: ing.section,
            }))
          : [{ name: '', quantity: '', unit: 'cup' }],
        instructions: recipe.instructions && recipe.instructions.length > 0
          ? recipe.instructions
          : [''],
        categories: recipe.categories || [],
        tags: recipe.tags || [],
        nutrition: recipe.nutrition,
      };
    } catch (err) {
      setError('Failed to load recipe');
      console.error('Failed to load recipe:', err);
    } finally {
      setLoadingRecipe(false);
    }
  };

  const addIngredient = () => {
    setFormData({
      ...formData,
      ingredients: [...formData.ingredients, { name: '', quantity: '', unit: 'cup' }],
    });
  };

  const removeIngredient = (index: number) => {
    setFormData({
      ...formData,
      ingredients: formData.ingredients.filter((_, i) => i !== index),
    });
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const updated = [...formData.ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, ingredients: updated });
  };

  const addInstruction = () => {
    setFormData({
      ...formData,
      instructions: [...formData.instructions, ''],
    });
  };

  const removeInstruction = (index: number) => {
    setFormData({
      ...formData,
      instructions: formData.instructions.filter((_, i) => i !== index),
    });
  };

  const updateInstruction = (index: number, value: string) => {
    const updated = [...formData.instructions];
    updated[index] = value;
    setFormData({ ...formData, instructions: updated });
  };

  const toggleCategory = (category: string) => {
    setFormData({
      ...formData,
      categories: formData.categories.includes(category)
        ? formData.categories.filter((c) => c !== category)
        : [...formData.categories, category],
    });
  };

  const toggleTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.includes(tag)
        ? formData.tags.filter((t) => t !== tag)
        : [...formData.tags, tag],
    });
  };

  const addCustomCategory = () => {
    const items = customCategoryInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) return;

    const updatedCategories = [...formData.categories];
    for (const item of items) {
      if (!updatedCategories.some((c) => c.toLowerCase() === item.toLowerCase())) {
        updatedCategories.push(item);
      }
    }
    setFormData({ ...formData, categories: updatedCategories });
    setCustomCategoryInput('');
  };

  const addCustomTag = () => {
    const items = customTagInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) return;

    const updatedTags = [...formData.tags];
    for (const item of items) {
      if (!updatedTags.some((t) => t.toLowerCase() === item.toLowerCase())) {
        updatedTags.push(item);
      }
    }
    setFormData({ ...formData, tags: updatedTags });
    setCustomTagInput('');
  };

  const allCategoryChoices = Array.from(new Set([...taxonomyCategories, ...formData.categories]));
  const allTagChoices = Array.from(new Set([...taxonomyTags, ...formData.tags]));

  const renderCategoriesAndTagsSection = () => (
    <div className="space-y-6 pt-2 border-t border-border">
      {/* Categories */}
      <div role="group" aria-labelledby="categories-group-label">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <label id="categories-group-label" className="block text-sm font-medium text-card-foreground">
              Categories
            </label>
            {isAdmin && (
              <Link to="/settings/taxonomies" className="text-muted-foreground hover:text-primary transition-colors" title="Manage default categories">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </Link>
            )}
          </div>
          {formData.categories.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {formData.categories.length} selected
            </span>
          )}
        </div>

        {/* Custom Category Input */}
        <div className="flex gap-2 mb-3">
          <label htmlFor="custom-category-input" className="sr-only">
            Add a custom category
          </label>
          <input
            id="custom-category-input"
            type="text"
            value={customCategoryInput}
            onChange={(e) => setCustomCategoryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomCategory();
              }
            }}
            placeholder="Add a category (e.g. Appetizers, Dinner) and press Enter..."
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={addCustomCategory}
            disabled={!customCategoryInput.trim()}
            className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/90 disabled:opacity-50 transition-colors"
          >
            + Add
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {allCategoryChoices.map((category) => {
            const isSelected = formData.categories.includes(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                }`}
              >
                {isSelected ? `✓ ${category}` : `+ ${category}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tags */}
      <div role="group" aria-labelledby="tags-group-label">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <label id="tags-group-label" className="block text-sm font-medium text-card-foreground">
              Tags & Dietary Labels
            </label>
            {isAdmin && (
              <Link to="/settings/taxonomies" className="text-muted-foreground hover:text-primary transition-colors" title="Manage default tags">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </Link>
            )}
          </div>
          {formData.tags.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {formData.tags.length} selected
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Suggestions may be added automatically — review before saving.
        </p>

        {/* Custom Tag Input */}
        <div className="flex gap-2 mb-3">
          <label htmlFor="custom-tag-input" className="sr-only">
            Add a custom tag
          </label>
          <input
            id="custom-tag-input"
            type="text"
            value={customTagInput}
            onChange={(e) => setCustomTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomTag();
              }
            }}
            placeholder="Type any tag (e.g. Quick, Kid Friendly, Vegan) and press Enter..."
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={addCustomTag}
            disabled={!customTagInput.trim()}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            + Add
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {allTagChoices.map((tag) => {
            const isSelected = formData.tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  isSelected
                    ? 'bg-secondary text-secondary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                }`}
              >
                {isSelected ? `✓ ${tag}` : `+ ${tag}`}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const isDirty =
    initialDataRef.current !== null &&
    JSON.stringify(formData) !== JSON.stringify(initialDataRef.current);

  const handleCancel = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Discard them and go back?',
        confirmLabel: 'Discard',
        danger: false,
      });
      if (!ok) return;
    }
    navigate(-1);
  };

  const validateForm = (): FormFieldError[] => {
    const errors: FormFieldError[] = [];
    if (!formData.title.trim()) {
      errors.push({ tab: 'basics', fieldId: 'title', message: 'Recipe name is required.' });
    }
    if (!formData.ingredients.some((ing) => ing.name.trim())) {
      errors.push({
        tab: 'ingredients',
        fieldId: 'ingredient-0-name',
        message: 'Add at least one ingredient with a name.',
      });
    }
    if (!formData.instructions.some((step) => step.trim())) {
      errors.push({
        tab: 'instructions',
        fieldId: 'instruction-0',
        message: 'Add at least one instruction step.',
      });
    }
    return errors;
  };

  const errorFor = (fieldId: string) => fieldErrors.find((e) => e.fieldId === fieldId);

  const jumpToError = (err: FormFieldError) => {
    setActiveTab(err.tab);
    // Wait for the tab to render, then move focus to the field
    setTimeout(() => {
      document.getElementById(err.fieldId)?.focus();
    }, 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors([]);
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setFieldErrors(validationErrors);
      jumpToError(validationErrors[0]);
      return;
    }
    // Prevent double-submits (e.g. fast double-click / Enter+click) from
    // creating duplicate records before the disabled button re-renders.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);

    try {
      // Filter out empty ingredients and instructions
      const cleanedIngredients = formData.ingredients
        .filter((ing) => ing.name.trim() !== '')
        .map((ing, index) => ({
          name: ing.name,
          quantity: ing.quantity ? fractionToDecimal(ing.quantity) : undefined,
          unit: ing.unit || undefined,
          notes: ing.notes || undefined,
          section: ing.section || undefined,
          order: index,
        }));

      const cleanedData = {
        ...formData,
        ingredients: cleanedIngredients,
        instructions: formData.instructions.filter((inst) => inst.trim() !== ''),
        totalTime: formData.prepTime + formData.cookTime,
      };

      if (recipeId) {
        // Update existing recipe
        await recipeApi.update(recipeId, cleanedData);
        navigate(`/recipes/${recipeId}`);
      } else {
        // Create new recipe
        const response = await recipeApi.create(cleanedData);
        navigate(`/recipes/${response.data.id}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || `Failed to ${recipeId ? 'update' : 'create'} recipe`);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const tabs = [
    { id: 'basics', label: 'Basics', icon: <DescriptionIcon size={18} /> },
    { id: 'ingredients', label: 'Ingredients', icon: <RestaurantIcon size={18} /> },
    { id: 'instructions', label: 'Instructions', icon: <ListIcon size={18} /> },
    { id: 'details', label: 'Details', icon: <SettingsIcon size={18} /> },
  ];

  if (loadingRecipe) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading recipe...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">
            {recipeId ? 'Edit Recipe' : 'Create New Recipe'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {recipeId ? 'Update your recipe details' : 'Add a delicious recipe to your collection'}
          </p>
        </div>
      </div>

      {error && (
        <div
          className="mb-6 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Tabs — horizontally scrollable on narrow viewports so every tab stays reachable */}
      <div className="mb-6 border-b border-border overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <span className="mr-2 flex items-center">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-card rounded-lg border border-border p-6 shadow-sm" noValidate>
        {fieldErrors.length > 0 && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4"
          >
            <p className="font-medium text-destructive mb-2">
              Please fix {fieldErrors.length === 1 ? 'this issue' : 'these issues'}:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              {fieldErrors.map((err, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => jumpToError(err)}
                    className="text-destructive underline hover:no-underline text-left"
                  >
                    {err.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Basics Tab */}
        {activeTab === 'basics' && (
          <div className="space-y-6">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-card-foreground mb-2">
                Recipe Name <span className="text-destructive">*</span>
              </label>
              <input
                id="title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g., Grandma's Chocolate Chip Cookies"
                aria-invalid={!!errorFor('title')}
                aria-describedby={errorFor('title') ? 'title-error' : undefined}
              />
              {errorFor('title') && (
                <p id="title-error" className="text-destructive text-sm mt-1">
                  {errorFor('title')!.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-card-foreground mb-2">
                Description
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Brief description of your recipe..."
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="servings" className="block text-sm font-medium text-card-foreground mb-2">
                  Servings
                </label>
                <input
                  id="servings"
                  type="number"
                  min="1"
                  value={formData.servings}
                  onChange={(e) => setFormData({ ...formData, servings: parseInt(e.target.value) })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label htmlFor="prepTime" className="block text-sm font-medium text-card-foreground mb-2">
                  Prep Time (min)
                </label>
                <input
                  id="prepTime"
                  type="number"
                  min="0"
                  value={formData.prepTime}
                  onChange={(e) => setFormData({ ...formData, prepTime: parseInt(e.target.value) })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label htmlFor="cookTime" className="block text-sm font-medium text-card-foreground mb-2">
                  Cook Time (min)
                </label>
                <input
                  id="cookTime"
                  type="number"
                  min="0"
                  value={formData.cookTime}
                  onChange={(e) => setFormData({ ...formData, cookTime: parseInt(e.target.value) })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div>
              <label id="difficulty-label" className="block text-sm font-medium text-card-foreground mb-3">
                Difficulty Level
              </label>
              <div className="grid grid-cols-3 gap-4" role="group" aria-labelledby="difficulty-label">
                {DIFFICULTY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, difficulty: option.value as any })}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      formData.difficulty === option.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-medium text-card-foreground">{option.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{option.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {renderCategoriesAndTagsSection()}
          </div>
        )}

        {/* Ingredients Tab */}
        {activeTab === 'ingredients' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-card-foreground">Ingredients</h3>
                {errorFor('ingredient-0-name') && (
                  <p className="text-destructive text-sm mt-1">{errorFor('ingredient-0-name')!.message}</p>
                )}
              </div>
              <button
                type="button"
                onClick={addIngredient}
                className="text-sm text-primary hover:text-primary/80 font-medium"
              >
                + Add Ingredient
              </button>
            </div>

            {formData.ingredients.map((ingredient, index) => (
              <div key={index} className="grid grid-cols-12 gap-3 items-start">
                <div className="col-span-2">
                  <label htmlFor={`ingredient-${index}-quantity`} className="sr-only">
                    Quantity for ingredient {index + 1}
                  </label>
                  <input
                    id={`ingredient-${index}-quantity`}
                    type="text"
                    value={ingredient.quantity}
                    onChange={(e) => updateIngredient(index, 'quantity', e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="1/2"
                    title="Enter fractions (e.g., 1/2, 1 1/4) or decimals"
                  />
                </div>

                <div className="col-span-2">
                  <label htmlFor={`ingredient-${index}-unit`} className="sr-only">
                    Unit for ingredient {index + 1}
                  </label>
                  <select
                    id={`ingredient-${index}-unit`}
                    value={ingredient.unit}
                    onChange={(e) => updateIngredient(index, 'unit', e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {COMMON_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-7">
                  <label htmlFor={`ingredient-${index}-name`} className="sr-only">
                    Ingredient {index + 1} name
                  </label>
                  <input
                    id={`ingredient-${index}-name`}
                    type="text"
                    value={ingredient.name}
                    onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Ingredient name"
                  />
                </div>

                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeIngredient(index)}
                    className="text-destructive hover:text-destructive/80 p-2 flex items-center justify-center"
                    aria-label="Remove ingredient"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Instructions Tab */}
        {activeTab === 'instructions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-card-foreground">Cooking Instructions</h3>
                {errorFor('instruction-0') && (
                  <p className="text-destructive text-sm mt-1">{errorFor('instruction-0')!.message}</p>
                )}
              </div>
              <button
                type="button"
                onClick={addInstruction}
                className="text-sm text-primary hover:text-primary/80 font-medium"
              >
                + Add Step
              </button>
            </div>

            {formData.instructions.map((instruction, index) => (
              <div key={index} className="flex gap-3 items-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                  {index + 1}
                </div>
                <label htmlFor={`instruction-${index}`} className="sr-only">
                  Step {index + 1} instructions
                </label>
                <textarea
                  id={`instruction-${index}`}
                  value={instruction}
                  onChange={(e) => updateInstruction(index, e.target.value)}
                  rows={2}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={`Step ${index + 1} instructions...`}
                />
                <button
                  type="button"
                  onClick={() => removeInstruction(index)}
                  className="text-destructive hover:text-destructive/80 p-2 flex items-center justify-center"
                  aria-label="Remove step"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="space-y-6">
            {renderCategoriesAndTagsSection()}

            <div className="grid grid-cols-2 gap-6">
              <div>
                <ImageUpload
                  currentImageUrl={formData.imageUrl}
                  onImageChange={(imageUrl) => setFormData({ ...formData, imageUrl })}
                  onUpload={async (file) => {
                    const response = await recipeApi.uploadImage(file, recipeId);
                    return { imageUrl: response.data.imageUrl };
                  }}
                  recipeId={recipeId}
                  recipeTitle={formData.title}
                  recipeDescription={formData.description}
                />
              </div>

              <div>
                <label htmlFor="sourceUrl" className="block text-sm font-medium text-card-foreground mb-2">
                  Source URL
                </label>
                <input
                  id="sourceUrl"
                  type="url"
                  value={formData.sourceUrl || ''}
                  onChange={(e) => setFormData({ ...formData, sourceUrl: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="https://example.com/recipe"
                />
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-card-foreground mb-2">
                Notes
              </label>
              <textarea
                id="notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Any additional notes or tips..."
              />
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="mt-8 flex gap-3 justify-end pt-6 border-t border-border">
          <button
            type="button"
            onClick={handleCancel}
            className="px-6 py-2.5 rounded-md border border-border text-card-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? (recipeId ? 'Saving...' : 'Creating...')
              : (recipeId ? 'Save Changes' : 'Create Recipe')
            }
          </button>
        </div>
      </form>
    </div>
  );
}
