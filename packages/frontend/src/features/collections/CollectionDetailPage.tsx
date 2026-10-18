import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { collectionApi } from '@/services/api';
import type { RecipeCollection, RecipeCollectionItem } from '@nommable/shared';
import { RestaurantIcon } from '@/components/icons/MaterialIcon';
import { useConfirmStore } from '@/store/confirm.store';
import { useToastStore } from '@/store/toast.store';
import { AddRecipesDialog } from './AddRecipesDialog';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';

interface CollectionWithItems extends RecipeCollection {
  items?: RecipeCollectionItem[];
}

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<CollectionWithItems | null>(null);
  const confirm = useConfirmStore((s) => s.confirm);
  const toast = useToastStore();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Add-recipes dialog state
  const [showAddRecipes, setShowAddRecipes] = useState(false);

  const loadCollection = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await collectionApi.getById(id);
      setCollection(data as CollectionWithItems);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setNotFound(true);
      } else {
        console.error('Failed to load collection:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollection();
  }, [id]);

  const handleRemoveRecipe = async (recipeId: string) => {
    if (!id || !collection) return;
    const recipeTitle = collection.items?.find((item) => item.recipeId === recipeId)?.recipe?.title ?? 'this recipe';
    const ok = await confirm({
      title: 'Remove recipe?',
      message: `Remove "${recipeTitle}" from "${collection.name}"? The recipe itself will not be deleted.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      await collectionApi.removeRecipe(id, recipeId);
      setCollection((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items?.filter((item) => item.recipeId !== recipeId),
        };
      });
      toast.success('Recipe removed from collection.');
    } catch (err) {
      console.error('Failed to remove recipe:', err);
      toast.error('Failed to remove recipe from collection. Please try again.');
    }
  };

  const handleStartEdit = () => {
    if (!collection) return;
    setEditName(collection.name);
    setEditDescription(collection.description ?? '');
    setEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !collection) return;
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const updated = await collectionApi.update(id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setCollection((prev) => ({
        ...(prev as CollectionWithItems),
        ...updated.data,
      }));
      setEditing(false);
    } catch (err) {
      console.error('Failed to update collection:', err);
      toast.error('Failed to update collection. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !collection) return;
    const ok = await confirm({
      title: 'Delete collection?',
      message: `Permanently delete "${collection.name}"? The recipes inside will not be deleted.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await collectionApi.delete(id);
      toast.success(`Collection "${collection.name}" deleted.`);
      navigate('/collections');
    } catch (err) {
      console.error('Failed to delete collection:', err);
      toast.error('Failed to delete collection. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading collection...</div>
      </div>
    );
  }

  if (notFound || !collection) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground text-lg">Collection not found.</p>
        <Link to="/collections" className="mt-4 inline-block text-primary hover:underline">
          Back to Collections
        </Link>
      </div>
    );
  }

  const recipes = (collection.items ?? []).map((item) => item.recipe).filter(Boolean);
  const existingRecipeIds = new Set((collection.items ?? []).map((item) => item.recipeId));

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/collections"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors mb-4"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          Collections
        </Link>

        {editing ? (
          <form onSubmit={handleSaveEdit} className="space-y-3 max-w-lg">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full text-3xl font-bold rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Collection name"
              autoFocus
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Description (optional)"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <PageHeader
            title={collection.name}
            subtitle={
              <>
                {collection.description && <p>{collection.description}</p>}
                <p className="mt-1 text-sm">
                  {recipes.length} recipe{recipes.length !== 1 ? 's' : ''}
                </p>
              </>
            }
            secondaryActions={
              <>
                {!collection.isFavorites && (
                  <button
                    onClick={handleStartEdit}
                    className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-all"
                  >
                    Edit
                  </button>
                )}
                {!collection.isFavorites && (
                  <button
                    onClick={handleDelete}
                    className="rounded-lg border border-destructive/30 bg-background px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-all"
                  >
                    Delete Collection
                  </button>
                )}
              </>
            }
            primaryAction={
              <button
                onClick={() => setShowAddRecipes(true)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all"
              >
                Add Recipes
              </button>
            }
          />
          {collection.isFavorites && (
            <p className="mb-4 text-sm text-muted-foreground">
              <span className="text-red-500 text-base" aria-hidden="true">
                &#10084;{' '}
              </span>
              Favorites collection
            </p>
          )}
          </>
        )}
      </div>

      {/* Recipe Grid */}
      {recipes.length === 0 ? (
        <EmptyState
          title="This collection is empty."
          action={
            <button
              type="button"
              onClick={() => setShowAddRecipes(true)}
              className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Add recipes
            </button>
          }
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(collection.items ?? []).map((item) => {
            const recipe = item.recipe;
            if (!recipe) return null;
            const totalTime = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);

            return (
              <div
                key={item.id}
                className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:shadow-lg hover:border-primary/30"
              >
                <Link
                  to={`/recipes/${recipe.id}`}
                  className="block focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  aria-label={`View recipe: ${recipe.title}`}
                >
                  {/* Hero image */}
                  <div className="relative overflow-hidden bg-muted aspect-[16/10]">
                    {recipe.imageUrl ? (
                      <>
                        <img
                          src={recipe.imageUrl}
                          alt={recipe.title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <RestaurantIcon size={64} className="text-muted-foreground" />
                      </div>
                    )}
                    {totalTime > 0 && (
                      <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        {totalTime}m
                      </div>
                    )}
                  </div>

                  {/* Card content */}
                  <div className="p-4">
                    <h3 className="text-xl font-bold text-foreground mb-1 line-clamp-2 group-hover:text-primary transition-colors">
                      {recipe.title}
                    </h3>
                    {recipe.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{recipe.description}</p>
                    )}
                  </div>
                </Link>

                {/* Remove from collection button */}
                <div className="px-4 pb-4">
                  <button
                    onClick={() => handleRemoveRecipe(recipe.id)}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 transition-all"
                  >
                    Remove from collection
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Recipes Dialog */}
      {showAddRecipes && (
        <AddRecipesDialog
          collectionId={collection.id}
          collectionName={collection.name}
          existingRecipeIds={existingRecipeIds}
          onClose={() => setShowAddRecipes(false)}
          onAdded={loadCollection}
        />
      )}
    </div>
  );
}
