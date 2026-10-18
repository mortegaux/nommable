import { useState, useEffect } from 'react';
import { taxonomyApi } from '@/services/api';
import type { Taxonomy, TaxonomyType } from '@nommable/shared';
import { useConfirmStore } from '@/store/confirm.store';
import { PageHeader } from '@/components/PageHeader';
import { Callout } from '@/components/Callout';

export default function TaxonomyManagement() {
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([]);
  const confirm = useConfirmStore((s) => s.confirm);
  const [activeTab, setActiveTab] = useState<TaxonomyType>('category');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTaxonomies();
  }, []);

  const loadTaxonomies = async () => {
    try {
      const response = await taxonomyApi.getAll();
      setTaxonomies(response.data);
    } catch {
      setError('Failed to load taxonomies');
    } finally {
      setLoading(false);
    }
  };

  const filtered = taxonomies.filter((t) => t.type === activeTab);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setError('');
    try {
      await taxonomyApi.create({ name: newName.trim(), type: activeTab, color: newColor || undefined });
      setNewName('');
      setNewColor('');
      loadTaxonomies();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create');
    }
  };

  const handleRename = async (id: string) => {
    if (!editingName.trim()) return;
    setError('');
    try {
      await taxonomyApi.update(id, { name: editingName.trim() });
      setEditingId(null);
      loadTaxonomies();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to rename');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete "${name}"?`,
      message: `"${name}" will be removed from all recipes that use it. This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setError('');
    try {
      await taxonomyApi.delete(id);
      loadTaxonomies();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const ids = filtered.map((t) => t.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    try {
      await taxonomyApi.reorder(ids);
      loadTaxonomies();
    } catch {
      setError('Failed to reorder');
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index === filtered.length - 1) return;
    const ids = filtered.map((t) => t.id);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    try {
      await taxonomyApi.reorder(ids);
      loadTaxonomies();
    } catch {
      setError('Failed to reorder');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Categories & Tags"
        subtitle="Manage the categories and tags available for recipes."
      />

      {error && (
        <Callout tone="error" className="mb-4 text-sm">
          {error}
        </Callout>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-border">
        <div className="flex gap-2">
          {(['category', 'tag'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {tab === 'category' ? 'Categories' : 'Tags'}
              <span className="ml-2 text-xs text-muted-foreground">
                ({taxonomies.filter((t) => t.type === tab).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Add New */}
      <div className="mb-6 bg-card rounded-lg border border-border p-4 shadow-sm">
        <h3 className="text-sm font-medium text-foreground mb-3">
          Add New {activeTab === 'category' ? 'Category' : 'Tag'}
        </h3>
        <div className="flex gap-3">
          <label htmlFor="taxonomy-new-name" className="sr-only">
            New {activeTab === 'category' ? 'category' : 'tag'} name
          </label>
          <input
            id="taxonomy-new-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Name"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <label htmlFor="taxonomy-new-color" className="sr-only">
            Color (optional)
          </label>
          <input
            id="taxonomy-new-color"
            type="text"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            placeholder="Color (optional)"
            className="w-32 rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleAdd}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-card rounded-lg border border-border shadow-sm divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No {activeTab === 'category' ? 'categories' : 'tags'} yet. Use the form above to add your first one.
          </div>
        ) : (
          filtered.map((item, index) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              {/* Reorder buttons */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs"
                  aria-label="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleMoveDown(index)}
                  disabled={index === filtered.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs"
                  aria-label="Move down"
                >
                  ▼
                </button>
              </div>

              {/* Name (inline edit) */}
              <div className="flex-1">
                {editingId === item.id ? (
                  <div className="flex items-center gap-2">
                    <label htmlFor={`rename-${item.id}`} className="sr-only">
                      Rename {item.name}
                    </label>
                    <input
                      id={`rename-${item.id}`}
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(item.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                      className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => handleRename(item.id)}
                      className="px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-2 py-1 rounded-md bg-muted text-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingId(item.id);
                      setEditingName(item.name);
                    }}
                    className="text-sm text-foreground hover:text-primary transition-colors text-left"
                    title="Click to rename"
                  >
                    {item.name}
                  </button>
                )}
              </div>

              {/* Color indicator */}
              {item.color && (
                <span
                  className="w-4 h-4 rounded-full border border-border"
                  style={{ backgroundColor: item.color }}
                />
              )}

              {/* Delete */}
              <button
                onClick={() => handleDelete(item.id, item.name)}
                className="text-destructive hover:text-destructive/80 text-sm transition-colors"
                aria-label={`Delete ${item.name}`}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
