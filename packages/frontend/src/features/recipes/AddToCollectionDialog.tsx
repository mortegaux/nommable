import { useEffect, useState } from 'react';
import { collectionApi } from '@/services/api';
import type { RecipeCollection } from '@nommable/shared';
import { Dialog } from '@/components/Dialog';
import { useToastStore } from '@/store/toast.store';

interface AddToCollectionDialogProps {
  /** Ids of the selected recipes to add. */
  recipeIds: string[];
  onClose: () => void;
  /** Called after a successful add so the parent can clear its selection. */
  onAdded: () => void;
}

/**
 * Modal for the recipes page bulk action bar: pick an existing collection
 * (or create a new one inline) and add every selected recipe to it.
 * Duplicate adds are safe no-ops — the API returns the existing item.
 */
export function AddToCollectionDialog({ recipeIds, onClose, onAdded }: AddToCollectionDialogProps) {
  const toast = useToastStore();
  const [collections, setCollections] = useState<RecipeCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    collectionApi
      .getAll()
      .then((data) => {
        if (cancelled) return;
        // Favorites first, then rest sorted alphabetically (mirrors CollectionsPage).
        const sorted = [...data].sort((a, b) => {
          if (a.isFavorites && !b.isFavorites) return -1;
          if (!a.isFavorites && b.isFavorites) return 1;
          return a.name.localeCompare(b.name);
        });
        setCollections(sorted);
        setSelectedId(sorted[0]?.id ?? '');
      })
      .catch((err) => {
        console.error('Failed to load collections:', err);
        if (!cancelled) useToastStore.getState().error('Failed to load collections. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canConfirm = creatingNew ? newName.trim().length > 0 : selectedId !== '';

  const handleAdd = async () => {
    if (!canConfirm || saving) return;
    setSaving(true);
    try {
      let targetId = selectedId;
      let targetName = collections.find((c) => c.id === selectedId)?.name ?? 'collection';
      if (creatingNew) {
        const res = await collectionApi.create({ name: newName.trim() });
        targetId = res.data.id;
        targetName = res.data.name;
      }
      const results = await Promise.allSettled(
        recipeIds.map((recipeId) => collectionApi.addRecipe(targetId, recipeId))
      );
      const added = results.filter((r) => r.status === 'fulfilled').length;
      if (added > 0) {
        toast.success(`"${targetName}": ${added} recipe${added === 1 ? '' : 's'} added.`);
        onAdded();
        onClose();
      } else {
        toast.error('Failed to add recipes to collection. Please try again.');
      }
    } catch (err) {
      console.error('Failed to add recipes to collection:', err);
      toast.error('Failed to add recipes to collection. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={`Add ${recipeIds.length} recipe${recipeIds.length === 1 ? '' : 's'} to collection`}
      onClose={onClose}
      size="small"
    >
      <div className="p-6 space-y-4">
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading collections...</div>
        ) : (
          <>
            {creatingNew ? (
              <div>
                <label
                  htmlFor="new-collection-name"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  New collection name
                </label>
                <input
                  id="new-collection-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Weekend Dinners"
                  autoFocus
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            ) : collections.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No collections yet — create one below.
              </p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {collections.map((c) => (
                  <li key={c.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition-colors ${
                        selectedId === c.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-accent'
                      }`}
                    >
                      <input
                        type="radio"
                        name="collection"
                        checked={selectedId === c.id}
                        onChange={() => setSelectedId(c.id)}
                        className="h-4 w-4 text-primary focus:ring-2 focus:ring-primary"
                        aria-label={`Add to ${c.name}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {c.isFavorites && (
                            <span className="text-red-500 mr-1" aria-hidden="true">
                              &#10084;
                            </span>
                          )}
                          {c.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {c.recipeCount ?? 0} recipe{(c.recipeCount ?? 0) !== 1 ? 's' : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            {creatingNew ? (
              collections.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCreatingNew(false)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  &larr; Choose an existing collection
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => setCreatingNew(true)}
                className="text-sm text-primary hover:underline"
              >
                + Create new collection
              </button>
            )}
          </>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canConfirm || saving || loading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Adding' : 'Add to collection'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
