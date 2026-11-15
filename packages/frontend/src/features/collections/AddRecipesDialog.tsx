import { useEffect, useState } from 'react';
import { collectionApi, recipeApi } from '@/services/api';
import type { Recipe } from '@nommable/shared';
import { Dialog } from '@/components/Dialog';
import { UtensilsCrossed } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useToastStore } from '@/store/toast.store';

interface AddRecipesDialogProps {
  collectionId: string;
  collectionName: string;
  /** Recipe ids already in the collection — excluded from the picker. */
  existingRecipeIds: Set<string>;
  onClose: () => void;
  /** Called after a successful add so the parent can refresh the collection. */
  onAdded: () => void;
}

/**
 * Modal for adding recipes to a collection: searchable recipe list with
 * multi-select checkboxes, then one confirm action that adds each selected
 * recipe via the collections API. Recipes already in the collection are
 * excluded (the API is also idempotent, so re-adds are safe no-ops).
 */
export function AddRecipesDialog({
  collectionId,
  collectionName,
  existingRecipeIds,
  onClose,
  onAdded,
}: AddRecipesDialogProps) {
  const toast = useToastStore();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    recipeApi
      .getAll({ page: 1, pageSize: 100, query: debouncedSearch.trim() || undefined })
      .then((res) => {
        if (!cancelled) setRecipes(res.data);
      })
      .catch((err) => {
        console.error('Failed to load recipes:', err);
        if (!cancelled) useToastStore.getState().error('Failed to load recipes. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const available = recipes.filter((r) => !existingRecipeIds.has(r.id));

  const toggle = (recipeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) {
        next.delete(recipeId);
      } else {
        next.add(recipeId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === available.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(available.map((r) => r.id)));
    }
  };

  const handleAdd = async () => {
    if (selected.size === 0 || adding) return;
    setAdding(true);
    try {
      const results = await Promise.allSettled(
        Array.from(selected).map((recipeId) => collectionApi.addRecipe(collectionId, recipeId))
      );
      const added = results.filter((r) => r.status === 'fulfilled').length;
      if (added > 0) {
        toast.success(`"${collectionName}": ${added} recipe${added === 1 ? '' : 's'} added.`);
        onAdded();
        onClose();
      } else {
        toast.error('Failed to add recipes. Please try again.');
      }
    } catch (err) {
      console.error('Failed to add recipes to collection:', err);
      toast.error('Failed to add recipes. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog
      title={`Add recipes to "${collectionName}"`}
      onClose={onClose}
    >
      <div className="p-6 space-y-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipes"
          aria-label="Search recipes"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading recipes</div>
        ) : available.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {recipes.length === 0
              ? 'No recipes found. Try a different search.'
              : 'All matching recipes are already in this collection.'}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {selected.size} of {available.length} selected
              </p>
              <button
                type="button"
                onClick={toggleAll}
                className="text-sm text-primary hover:underline"
              >
                {selected.size === available.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <ul className="max-h-80 overflow-y-auto divide-y divide-border rounded-md border border-border">
              {available.map((recipe) => (
                <li key={recipe.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={selected.has(recipe.id)}
                      onChange={() => toggle(recipe.id)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-primary"
                      aria-label={`Select ${recipe.title}`}
                    />
                    {recipe.imageUrl ? (
                      <img
                        src={recipe.imageUrl}
                        alt=""
                        className="h-10 w-10 rounded-md object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                        <UtensilsCrossed className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {recipe.title}
                      </span>
                      {recipe.description && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {recipe.description}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={adding}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={selected.size === 0 || adding}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {adding
              ? 'Adding'
              : `Add ${selected.size > 0 ? `${selected.size} ` : ''}recipe${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
