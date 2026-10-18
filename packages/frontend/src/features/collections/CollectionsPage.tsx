import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collectionApi } from '@/services/api';
import type { RecipeCollection, CreateCollectionDto } from '@nommable/shared';
import { useConfirmStore } from '@/store/confirm.store';
import { useToastStore } from '@/store/toast.store';
import { PageHeader, PageShell } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';

export default function CollectionsPage() {
  const [collections, setCollections] = useState<RecipeCollection[]>([]);
  const confirm = useConfirmStore((s) => s.confirm);
  const toast = useToastStore();
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const loadCollections = async () => {
    setLoading(true);
    try {
      const data = await collectionApi.getAll();
      setCollections(data);
    } catch (err) {
      console.error('Failed to load collections:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollections();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setError('Name is required');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const dto: CreateCollectionDto = {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      };
      await collectionApi.create(dto);
      setNewName('');
      setNewDescription('');
      setShowCreateForm(false);
      await loadCollections();
    } catch (err) {
      console.error('Failed to create collection:', err);
      setError('Failed to create collection. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Delete collection?',
      message: `Permanently delete "${name}"? The recipes inside will not be deleted.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await collectionApi.delete(id);
      setCollections((prev) => prev.filter((c) => c.id !== id));
      toast.success(`Collection "${name}" deleted.`);
    } catch (err) {
      console.error('Failed to delete collection:', err);
      toast.error('Failed to delete collection. Please try again.');
    }
  };

  // Favorites first, then rest sorted alphabetically
  const sorted = [...collections].sort((a, b) => {
    if (a.isFavorites && !b.isFavorites) return -1;
    if (!a.isFavorites && b.isFavorites) return 1;
    return a.name.localeCompare(b.name);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading collections...</div>
      </div>
    );
  }

  return (
    <PageShell>
      {/* Header */}
      <PageHeader
        title="Collections"
        subtitle={`${collections.length} collection${collections.length !== 1 ? 's' : ''}`}
        primaryAction={
          <button
            onClick={() => setShowCreateForm(true)}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Create Collection
          </button>
        }
      />

      {/* Create Collection Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Create Collection</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="col-name" className="block text-sm font-medium text-foreground mb-1">
                  Name <span className="text-destructive">*</span>
                </label>
                <input
                  id="col-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Weekend Dinners"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="col-desc" className="block text-sm font-medium text-foreground mb-1">
                  Description <span className="text-muted-foreground text-xs">(optional)</span>
                </label>
                <textarea
                  id="col-desc"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="A short description of this collection..."
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewName('');
                    setNewDescription('');
                    setError('');
                  }}
                  className="flex-1 rounded-lg border border-border bg-background px-4 py-2 font-medium text-foreground hover:bg-accent transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Collections Grid */}
      {sorted.length === 0 ? (
        <EmptyState
          title="No collections yet"
          description="Create your first collection!"
          action={
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Create Collection
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((collection) => (
            <div
              key={collection.id}
              className="relative group rounded-xl border border-border bg-card shadow-sm transition-all hover:shadow-md hover:border-primary/30"
            >
              <Link
                to={`/collections/${collection.id}`}
                className="block p-5 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-xl"
                aria-label={`View collection: ${collection.name}`}
              >
                <div className="flex items-start gap-3 mb-2">
                  {collection.isFavorites ? (
                    <span className="text-red-500 text-xl" aria-label="Favorites collection">
                      &#10084;
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xl" aria-hidden="true">
                      &#128193;
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      {collection.name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {collection.recipeCount ?? 0} recipe{(collection.recipeCount ?? 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                {collection.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{collection.description}</p>
                )}
              </Link>

              {/* Delete button for non-favorites */}
              {!collection.isFavorites && (
                <button
                  onClick={() => handleDelete(collection.id, collection.name)}
                  className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Delete collection "${collection.name}"`}
                  title="Delete collection"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
