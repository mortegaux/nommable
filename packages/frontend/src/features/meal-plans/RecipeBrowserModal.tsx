import { useState, useEffect } from 'react';
import { recipeApi } from '@/services/api';
import type { Recipe } from '@nommable/shared';
import { Dialog } from '@/components/Dialog';

interface RecipeBrowserModalProps {
  onClose: () => void;
  onSelect: (recipe: Recipe) => void;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

export function RecipeBrowserModal({ onClose, onSelect, mealType }: RecipeBrowserModalProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    try {
      const response = await recipeApi.getAll();
      setRecipes(response.data);
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter recipes based on meal type tags and search
  const filteredRecipes = recipes.filter((recipe) => {
    const matchesSearch =
      !searchQuery ||
      recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recipe.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesMealType =
      recipe.tags?.some((tag) => tag.toLowerCase().includes(mealType.toLowerCase())) || true;

    const matchesTags =
      selectedTags.length === 0 ||
      selectedTags.some((tag) => recipe.tags?.includes(tag));

    return matchesSearch && matchesMealType && matchesTags;
  });

  // Get all unique tags from recipes
  const allTags = Array.from(
    new Set(recipes.flatMap((r) => r.tags || []))
  ).sort();

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <Dialog
      title={`Choose a Recipe for ${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`}
      onClose={onClose}
      panelClassName="max-w-4xl"
    >
      <div className="p-6">
          {/* Search */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recipes..."
            aria-label="Search recipes"
            className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />

          {/* Tag Filters */}
          {allTags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {allTags.slice(0, 10).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  aria-pressed={selectedTags.includes(tag)}
                  className={`px-2 py-1 rounded-full text-xs font-medium transition-all ${
                    selectedTags.includes(tag)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-accent text-accent-foreground hover:bg-accent/80'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

        {/* Recipe List */}
        <div className="mt-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading recipes...</div>
          ) : filteredRecipes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No recipes found. Try adjusting your search or filters.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredRecipes.map((recipe) => (
                <button
                  key={recipe.id}
                  onClick={() => onSelect(recipe)}
                  className="text-left bg-accent/10 border border-border rounded-lg p-4 hover:border-primary hover:bg-accent/20 transition-all focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <h3 className="font-semibold text-foreground mb-1">{recipe.title}</h3>
                  {recipe.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {recipe.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {recipe.servings && <span>🍽️ {recipe.servings} servings</span>}
                    {recipe.cookTime && <span>⏱️ {recipe.cookTime} min</span>}
                    {recipe.difficulty && (
                      <span
                        className={`px-2 py-0.5 rounded-full ${
                          recipe.difficulty === 'easy'
                            ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                            : recipe.difficulty === 'medium'
                            ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                            : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {recipe.difficulty}
                      </span>
                    )}
                  </div>
                  {recipe.tags && recipe.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {recipe.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full text-xs bg-secondary/50 text-secondary-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </Dialog>
  );
}
