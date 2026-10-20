import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { recipeApi, taxonomyApi, historyApi, suggestionApi } from '@/services/api';
import { AutoAwesomeIcon, RestaurantIcon } from '@/components/icons/MaterialIcon';
import { useAuthStore } from '@/store/auth.store';
import { useRecipeCreateStore } from '@/store/recipeCreate.store';
import type { Recipe, RecipeSearchQuery, Taxonomy, ContentRecipeSuggestion } from '@nommable/shared';
import { Pagination } from '@/components/Pagination';
import { SectionTabs } from '@/components/SectionTabs';
import { useToastStore } from '@/store/toast.store';
import { useConfirmStore } from '@/store/confirm.store';
import { AddToCollectionDialog } from './AddToCollectionDialog';
import { useDebounce } from '@/hooks/useDebounce';
import { useAIStatus, aiNotConfiguredClass, AISetupBadge } from '@/hooks/useAIStatus';
import { PageHeader } from '@/components/PageHeader';

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    },
    []
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open, handleClickOutside]);

  const toggle = (item: string) => {
    const next = new Set(selected);
    if (next.has(item)) {
      next.delete(item);
    } else {
      next.add(item);
    }
    onChange(next);
  };

  const displayLabel = selected.size > 0 ? `${label} (${selected.size})` : label;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-md border border-input bg-background pl-3 pr-2 py-2 text-sm text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary whitespace-nowrap"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={displayLabel}
      >
        <span>{displayLabel}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 min-w-[180px] rounded-md border border-border bg-card shadow-lg">
          <ul role="group" aria-label={`${label} options`} className="max-h-60 overflow-auto py-1">
            {options.map((item) => (
              <li key={item}>
                <label className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(item)}
                    onChange={() => toggle(item)}
                    className="w-4 h-4 rounded border-input text-primary focus:ring-2 focus:ring-primary"
                  />
                  <span>{item}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const DIETARY_BADGES = {
  'Vegetarian': { color: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200' },
  'Vegan': { color: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200' },
  'Gluten-Free': { color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200' },
  'Dairy-Free': { color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200' },
  'Low-Carb': { color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200' },
  'Keto': { color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200' },
  'Paleo': { color: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200' },
  'Quick': { color: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200' },
  'One-Pot': { color: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200' },
  'Freezer-Friendly': { color: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-800 dark:text-cyan-200' },
  'Kid-Friendly': { color: 'bg-pink-100 dark:bg-pink-900/40 text-pink-800 dark:text-pink-200' },
  'Healthy': { color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200' },
};

const DIFFICULTY_DISPLAY = {
  'easy': { label: 'Easy', color: 'text-green-700 dark:text-green-300', icon: '●' },
  'medium': { label: 'Medium', color: 'text-amber-700 dark:text-amber-300', icon: '●●' },
  'hard': { label: 'Hard', color: 'text-red-700 dark:text-red-300', icon: '●●●' },
};

// Helper function to format time display
const formatTimeDisplay = (minutes: number): string => {
  if (minutes === 60) {
    return '1 hour';
  } else if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }
    return `${hours} hr ${remainingMinutes} min`;
  }
  return `${minutes} min`;
};

// Parse the pantry-based suggestion reason ("You have 3 of 8 ingredients")
// so the pantry match can be surfaced as a prominent badge on the card.
const parsePantryMatch = (reason: string): { matched: number; total: number } | null => {
  const m = /You have (\d+) of (\d+) ingredients?/i.exec(reason);
  if (!m) return null;
  return { matched: Number(m[1]), total: Number(m[2]) };
};

export default function RecipesPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const openAIGenerate = useRecipeCreateStore((s) => s.openAIGenerate);
  const { isReady: aiReady, isLoading: aiLoading } = useAIStatus();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const firstLoadRef = useRef(true);
  const requestIdRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const toast = useToastStore();
  const confirm = useConfirmStore((s) => s.confirm);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedDietaryTags, setSelectedDietaryTags] = useState<Set<string>>(new Set());
  const [selectedRecipes, setSelectedRecipes] = useState<Set<string>>(new Set());
  /** Explicit bulk-select mode: checkboxes and the bulk action bar only
   * exist while the user is deliberately doing bulk actions, so a stray
   * checkbox click can't summon the bar out of nowhere. */
  const [bulkSelectMode, setBulkSelectMode] = useState(false);

  const exitBulkSelectMode = () => {
    setBulkSelectMode(false);
    setSelectedRecipes(new Set());
  };
  const [showAddToCollection, setShowAddToCollection] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkEditTags, setBulkEditTags] = useState('');
  const [bulkEditCategories, setBulkEditCategories] = useState('');
  const [taxonomyCategories, setTaxonomyCategories] = useState<string[]>([]);
  const [taxonomyTags, setTaxonomyTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [recentRecipes, setRecentRecipes] = useState<Recipe[]>([]);
  const [suggestions, setSuggestions] = useState<ContentRecipeSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [includeIngredients, setIncludeIngredients] = useState('');
  const [excludeIngredients, setExcludeIngredients] = useState('');
  const [minCalories, setMinCalories] = useState('');
  const [maxCalories, setMaxCalories] = useState('');
  const [minProtein, setMinProtein] = useState('');
  const [maxProtein, setMaxProtein] = useState('');
  const [selectedSource, setSelectedSource] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    historyApi.getRecent(10).then(setRecentRecipes).catch(() => {});
    suggestionApi.get(6).then(setSuggestions).catch(() => {});
  }, []);

  const loadRecipes = useCallback(
    async (pageNum: number, append = false) => {
      const requestId = ++requestIdRef.current;
      if (firstLoadRef.current) {
        setInitialLoading(true);
      } else {
        setIsRefreshing(true);
      }
      try {
        const params: RecipeSearchQuery = {
          page: pageNum,
          pageSize: 20,
          query: debouncedSearchQuery || undefined,
          categories:
            selectedCategories.size > 0 ? Array.from(selectedCategories) : undefined,
          tags: selectedDietaryTags.size > 0 ? Array.from(selectedDietaryTags) : undefined,
          includeIngredients: includeIngredients
            ? includeIngredients
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          excludeIngredients: excludeIngredients
            ? excludeIngredients
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          minCalories: minCalories ? parseFloat(minCalories) : undefined,
          maxCalories: maxCalories ? parseFloat(maxCalories) : undefined,
          minProtein: minProtein ? parseFloat(minProtein) : undefined,
          maxProtein: maxProtein ? parseFloat(maxProtein) : undefined,
          source: selectedSource.size > 0 ? (Array.from(selectedSource) as any) : undefined,
        };
        const result = await recipeApi.getAll(params);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        setPage(result.page);
        if (append) {
          setRecipes((prev) => [...prev, ...result.data]);
        } else {
          setRecipes(result.data);
        }
      } catch (error) {
        console.error('Failed to load recipes:', error);
      } finally {
        if (requestId !== requestIdRef.current) return; // stale response, ignore
        firstLoadRef.current = false;
        setInitialLoading(false);
        setIsRefreshing(false);
      }
    },
    [
      debouncedSearchQuery,
      selectedCategories,
      selectedDietaryTags,
      includeIngredients,
      excludeIngredients,
      minCalories,
      maxCalories,
      minProtein,
      maxProtein,
      selectedSource,
    ]
  );

  useEffect(() => {
    setPage(1);
    loadRecipes(1);
  }, [loadRecipes]);

  const toggleRecipeSelection = (id: string) => {
    const newSelection = new Set(selectedRecipes);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedRecipes(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedRecipes.size === recipes.length) {
      setSelectedRecipes(new Set());
    } else {
      setSelectedRecipes(new Set(recipes.map((r) => r.id)));
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedRecipes.size;
    const ok = await confirm({
      title: `Delete ${count} recipe${count === 1 ? '' : 's'}?`,
      message: `Permanently delete ${count} recipe${count === 1 ? '' : 's'}? This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;

    try {
      await recipeApi.bulkDelete(Array.from(selectedRecipes));
      exitBulkSelectMode();
      loadRecipes(1);
      toast.success(`Deleted ${count} recipe${count === 1 ? '' : 's'}.`);
    } catch (error) {
      console.error('Failed to delete recipes:', error);
      toast.error('Failed to delete recipes. Please try again.');
    }
  };

  const handleBulkUpdate = async () => {
    const tags = bulkEditTags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
    const categories = bulkEditCategories
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    if (tags.length === 0 && categories.length === 0) {
      toast.error('Please enter at least one tag or category');
      return;
    }

    try {
      await recipeApi.bulkUpdate(
        Array.from(selectedRecipes),
        { tags: tags.length > 0 ? tags : undefined, categories: categories.length > 0 ? categories : undefined }
      );
      setSelectedRecipes(new Set());
      setShowBulkEdit(false);
      setBulkEditTags('');
      setBulkEditCategories('');
      setBulkSelectMode(false);
      loadRecipes(1);
    } catch (error) {
      console.error('Failed to update recipes:', error);
      toast.error('Failed to update recipes');
    }
  };

  // Combine taxonomy-sourced categories/tags with recipe-extracted values
  const allCategories = Array.from(
    new Set([...taxonomyCategories, ...recipes.flatMap((r) => r.categories || [])])
  ).filter(Boolean);
  const allDietaryTags = Array.from(
    new Set([
      ...taxonomyTags,
      ...Object.keys(DIETARY_BADGES),
      ...recipes.flatMap((r) => r.tags || []),
    ])
  ).filter(Boolean);

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      selectedCategories.size > 0 ||
      selectedDietaryTags.size > 0 ||
      includeIngredients.trim() ||
      excludeIngredients.trim() ||
      minCalories ||
      maxCalories ||
      minProtein ||
      maxProtein ||
      selectedSource.size > 0
  );

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground" role="status">
          Loading recipes...
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionTabs
        label="Recipes sections"
        tabs={[
          { path: '/recipes', label: 'All Recipes' },
          { path: '/collections', label: 'Collections' },
        ]}
      />
      {/* Header */}
      <PageHeader
        title="Recipes"
        subtitle={`${total} delicious recipes`}
        secondaryActions={
          <>
            <button
              onClick={() =>
                bulkSelectMode ? exitBulkSelectMode() : setBulkSelectMode(true)
              }
              className={`rounded-lg border px-4 py-2 font-medium shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 inline-flex items-center gap-2 ${
                bulkSelectMode
                  ? 'border-primary bg-primary/10 text-primary hover:bg-primary/15'
                  : 'border-border bg-background text-foreground hover:bg-accent'
              }`}
              aria-label={bulkSelectMode ? 'Exit bulk select mode' : 'Select recipes for bulk actions'}
              aria-pressed={bulkSelectMode}
            >
              {bulkSelectMode ? 'Done' : 'Select'}
            </button>
            <button
              onClick={() => void openAIGenerate()}
              className={`rounded-lg border border-border bg-background px-4 py-2 font-medium text-foreground hover:bg-accent shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 inline-flex items-center gap-2 ${!aiReady && !aiLoading ? aiNotConfiguredClass : ''}`}
              aria-label="Generate recipe with AI"
              title={!aiReady && !aiLoading ? 'Set up AI to unlock this feature' : undefined}
            >
              <AutoAwesomeIcon size={18} />
              Generate with AI
              {!aiReady && !aiLoading && <AISetupBadge />}
            </button>
          </>
        }
        primaryAction={
          <Link
            to="/recipes/new"
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 inline-flex items-center gap-2"
            aria-label="Create new recipe"
          >
            Create Recipe
          </Link>
        }
      />

      {/* Bulk Edit Modal */}
      {showBulkEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-foreground mb-4">Add Tags and Categories</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add tags and categories to {selectedRecipes.size} selected recipe(s). These will be added to existing ones.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={bulkEditTags}
                  onChange={(e) => setBulkEditTags(e.target.value)}
                  placeholder="e.g. Vegetarian, Quick, Healthy"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Categories (comma-separated)
                </label>
                <input
                  type="text"
                  value={bulkEditCategories}
                  onChange={(e) => setBulkEditCategories(e.target.value)}
                  placeholder="e.g. Dinner, Italian"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  setShowBulkEdit(false);
                  setBulkEditTags('');
                  setBulkEditCategories('');
                }}
                className="flex-1 rounded-lg border border-border bg-background px-4 py-2 font-medium text-foreground hover:bg-accent transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkUpdate}
                className="flex-1 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90 transition-all"
              >
                Apply to {selectedRecipes.size} recipes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="mb-6 bg-card rounded-lg border border-border p-4 shadow-sm space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative w-full sm:flex-1 sm:min-w-0">
            <input
              id="search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search recipes..."
              className="w-full rounded-md border border-input bg-background px-4 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Search recipes"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
          {allCategories.length > 0 && (
            <MultiSelectDropdown
              label="All Categories"
              options={allCategories}
              selected={selectedCategories}
              onChange={setSelectedCategories}
            />
          )}
          {allDietaryTags.length > 0 && (
            <MultiSelectDropdown
              label="All Tags"
              options={allDietaryTags}
              selected={selectedDietaryTags}
              onChange={setSelectedDietaryTags}
            />
          )}
          {recipes.length > 0 && bulkSelectMode && (
            <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={selectedRecipes.size === recipes.length && recipes.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-input text-primary focus:ring-2 focus:ring-primary"
              />
              <span className="text-sm text-muted-foreground">Select page</span>
            </label>
          )}
          {isAdmin && (
            <Link
              to="/settings/taxonomies"
              className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
              title="Edit categories & tags"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </Link>
          )}
          </div>
        </div>
        {(searchQuery.trim() || selectedCategories.size > 0 || selectedDietaryTags.size > 0) && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
            <span className="text-xs text-muted-foreground">Active:</span>
            {searchQuery.trim() && (
              <button
                key="search"
                onClick={() => setSearchQuery('')}
                aria-label={`Remove search filter "${searchQuery.trim()}"`}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 pl-2.5 pr-1.5 py-1 text-xs font-medium text-accent-foreground hover:bg-accent/30 transition-colors"
              >
                <span>Search: {searchQuery.trim()}</span>
                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-accent/30" aria-hidden="true">&times;</span>
              </button>
            )}
            {[...selectedCategories].map((cat) => (
              <button
                key={cat}
                onClick={() =>
                  setSelectedCategories((prev) => {
                    const next = new Set(prev);
                    next.delete(cat);
                    return next;
                  })
                }
                aria-label={`Remove category filter ${cat}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 pl-2.5 pr-1.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                <span>{cat}</span>
                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-primary/20" aria-hidden="true">&times;</span>
              </button>
            ))}
            {[...selectedDietaryTags].map((tag) => (
              <button
                key={tag}
                onClick={() =>
                  setSelectedDietaryTags((prev) => {
                    const next = new Set(prev);
                    next.delete(tag);
                    return next;
                  })
                }
                aria-label={`Remove tag filter ${tag}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-secondary/10 pl-2.5 pr-1.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/20 transition-colors"
              >
                <span>{tag}</span>
                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-secondary/20" aria-hidden="true">&times;</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setSelectedCategories(new Set());
                setSelectedDietaryTags(new Set());
              }}
              className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
            >
              Clear
            </button>
          </div>
        )}

        {/* Advanced Filters Toggle */}
        {(() => {
          const activeFilterCount =
            (includeIngredients ? 1 : 0) +
            (excludeIngredients ? 1 : 0) +
            (minCalories ? 1 : 0) +
            (maxCalories ? 1 : 0) +
            (minProtein ? 1 : 0) +
            (maxProtein ? 1 : 0) +
            selectedSource.size;
          return (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
                  aria-expanded={showAdvancedFilters}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-4 w-4 text-muted-foreground transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Advanced Filters
                  {activeFilterCount > 0 && (
                    <span className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium w-5 h-5">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              {showAdvancedFilters && (
                <div className="pt-2 border-t border-border space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Include Ingredients */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Include Ingredients
                      </label>
                      <input
                        type="text"
                        value={includeIngredients}
                        onChange={(e) => setIncludeIngredients(e.target.value)}
                        placeholder="e.g. chicken, garlic"
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <p className="mt-0.5 text-xs text-muted-foreground">Comma-separated</p>
                    </div>

                    {/* Exclude Ingredients */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Exclude Ingredients
                      </label>
                      <input
                        type="text"
                        value={excludeIngredients}
                        onChange={(e) => setExcludeIngredients(e.target.value)}
                        placeholder="e.g. nuts, dairy"
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <p className="mt-0.5 text-xs text-muted-foreground">Comma-separated</p>
                    </div>

                    {/* Calories Range */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Calories (per serving)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={minCalories}
                          onChange={(e) => setMinCalories(e.target.value)}
                          placeholder="Min"
                          min={0}
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <span className="text-muted-foreground text-sm">–</span>
                        <input
                          type="number"
                          value={maxCalories}
                          onChange={(e) => setMaxCalories(e.target.value)}
                          placeholder="Max"
                          min={0}
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>

                    {/* Protein Range */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Protein (g, per serving)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={minProtein}
                          onChange={(e) => setMinProtein(e.target.value)}
                          placeholder="Min"
                          min={0}
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <span className="text-muted-foreground text-sm">–</span>
                        <input
                          type="number"
                          value={maxProtein}
                          onChange={(e) => setMaxProtein(e.target.value)}
                          placeholder="Max"
                          min={0}
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>

                    {/* Source */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Source
                      </label>
                      <div className="flex flex-col gap-1.5">
                        {[
                          { value: 'manual', label: 'Manual' },
                          { value: 'imported', label: 'Imported' },
                          { value: 'ai_generated', label: 'AI Generated' },
                        ].map(({ value, label }) => (
                          <label
                            key={value}
                            className="flex items-center gap-2 cursor-pointer text-sm text-foreground"
                          >
                            <input
                              type="checkbox"
                              checked={selectedSource.has(value)}
                              onChange={() => {
                                setSelectedSource((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(value)) {
                                    next.delete(value);
                                  } else {
                                    next.add(value);
                                  }
                                  return next;
                                });
                              }}
                              className="w-4 h-4 rounded border-input text-primary focus:ring-2 focus:ring-primary"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {activeFilterCount > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setIncludeIngredients('');
                          setExcludeIngredients('');
                          setMinCalories('');
                          setMaxCalories('');
                          setMinProtein('');
                          setMaxProtein('');
                          setSelectedSource(new Set());
                        }}
                        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Recently Viewed (hidden while filtering/searching) */}
      {!hasActiveFilters && recentRecipes.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Recently Viewed</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {recentRecipes.map((recipe) => (
              <Link key={recipe.id} to={`/recipes/${recipe.id}`} className="flex-shrink-0 w-48">
                <div className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-card">
                  {recipe.imageUrl ? (
                    <img
                      src={
                        recipe.imageUrl.startsWith('http')
                          ? recipe.imageUrl
                          : `${window.location.origin}${recipe.imageUrl}`
                      }
                      alt=""
                      className="w-full h-28 object-cover"
                    />
                  ) : (
                    <div className="w-full h-28 bg-muted flex items-center justify-center text-muted-foreground text-2xl">
                      🍳
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-sm font-medium truncate">{recipe.title}</p>
                    {recipe.author && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        Added by{' '}
                        {recipe.author.firstName || recipe.author.lastName
                          ? `${recipe.author.firstName || ''} ${recipe.author.lastName || ''}`.trim()
                          : `@${recipe.author.username}`}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Suggested from your pantry (hidden while filtering/searching) */}
      {!hasActiveFilters && suggestions.length > 0 && showSuggestions && (
        <section aria-label="Suggested from your pantry" className="mb-8 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-700 text-white shadow-sm" aria-hidden="true">
                <AutoAwesomeIcon size={20} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-emerald-950 dark:text-emerald-100">Suggested from your pantry</h2>
                <p className="text-xs text-emerald-800 dark:text-emerald-200">Recipes you can cook with what's on hand</p>
              </div>
            </div>
            <button
              onClick={() => setShowSuggestions(false)}
              className="text-sm text-emerald-800 dark:text-emerald-200 hover:text-emerald-950 underline underline-offset-2 flex-shrink-0 ml-2"
            >
              Hide
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {suggestions.map(({ recipe, matchReason }) => {
              const pantryMatch = parsePantryMatch(matchReason);
              return (
                <Link key={recipe.id} to={`/recipes/${recipe.id}`}>
                  <div className="border-2 border-emerald-300 dark:border-emerald-700 border-l-4 border-l-emerald-500 rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-card">
                    {recipe.imageUrl ? (
                      <img
                        src={
                          recipe.imageUrl.startsWith('http')
                            ? recipe.imageUrl
                            : `${window.location.origin}${recipe.imageUrl}`
                        }
                        alt=""
                        className="w-full h-36 object-cover"
                      />
                    ) : (
                      <div className="w-full h-36 bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-700 dark:text-emerald-300 text-3xl">
                        🍳
                      </div>
                    )}
                    <div className="p-3">
                      {pantryMatch ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-700 text-white px-2.5 py-0.5 text-xs font-semibold mb-1.5">
                          <span aria-hidden="true">🧺</span> Uses {pantryMatch.matched} of {pantryMatch.total} pantry ingredients
                        </span>
                      ) : (
                        <p className="text-sm text-muted-foreground mb-1.5">{matchReason}</p>
                      )}
                      <p className="font-medium truncate">{recipe.title}</p>
                      {recipe.author && (
                        <p className="text-xs text-muted-foreground truncate mt-1">
                          Added by{' '}
                          {recipe.author.firstName || recipe.author.lastName
                            ? `${recipe.author.firstName || ''} ${recipe.author.lastName || ''}`.trim()
                            : `@${recipe.author.username}`}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Recipe Grid */}
      <span className="sr-only" role="status" aria-live="polite">
        {initialLoading
          ? 'Loading recipes'
          : `${total} ${total === 1 ? 'recipe' : 'recipes'} found${hasActiveFilters ? ' for current filters' : ''}`}
      </span>
      {isRefreshing && (
        <div
          className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Updating results...
        </div>
      )}
      {recipes.length === 0 && !isRefreshing ? (
        <div className="rounded-lg border-2 border-dashed border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">
            {hasActiveFilters
              ? 'No recipes match your filters. Try adjusting your search.'
              : 'No recipes yet. Create your first recipe!'}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => {
            const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);
            const difficulty = recipe.difficulty ? DIFFICULTY_DISPLAY[recipe.difficulty] : null;
            const recipeTags = recipe.tags || [];
            const isSelected = selectedRecipes.has(recipe.id);

            return (
              <div
                key={recipe.id}
                className={`group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:shadow-lg ${
                  isSelected
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                {/* Selection Checkbox — only in bulk-select mode */}
                {bulkSelectMode && (
                  <div className="absolute top-3 left-3 z-10">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleRecipeSelection(recipe.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 rounded border-2 border-white bg-white/90 text-primary shadow-md focus:ring-2 focus:ring-primary cursor-pointer"
                    />
                  </div>
                )}

                <Link
                  to={`/recipes/${recipe.id}`}
                  className="block focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  aria-label={`View recipe: ${recipe.title}`}
                >
                  {/* Hero Image */}
                  <div className="relative overflow-hidden bg-muted aspect-[16/10]">
                    {recipe.imageUrl ? (
                      <>
                        <img
                          src={recipe.imageUrl}
                          alt=""
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        {/* Gradient overlay for better text readability */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <RestaurantIcon size={64} className="text-muted-foreground" />
                      </div>
                    )}

                    {/* Time Badge - Overlay on image */}
                    {totalTime > 0 && (
                      <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        {formatTimeDisplay(totalTime)}
                      </div>
                    )}

                    {/* AI Generated Badge */}
                    {recipe.isAiGenerated && (
                      <div className="absolute bottom-3 left-3 bg-accent/90 backdrop-blur-sm text-accent-foreground px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1">
                        <AutoAwesomeIcon size={12} />
                        AI
                      </div>
                    )}
                  </div>

                  {/* Card Content */}
                  <div className="p-4">
                    {/* Title */}
                    <h3 className="text-xl font-bold text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                      {recipe.title}
                    </h3>

                    {/* Description */}
                    {recipe.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {recipe.description}
                      </p>
                    )}

                    {/* Categories */}
                    {recipe.categories && recipe.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {recipe.categories.slice(0, 2).map(category => (
                          <span
                            key={category}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-primary/15 text-primary border border-primary/30"
                          >
                            {category}
                          </span>
                        ))}
                        {recipe.categories.length > 2 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-foreground">
                            +{recipe.categories.length - 2}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Tags & Dietary Badges */}
                    {recipeTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {recipeTags.slice(0, 3).map(tag => {
                          const badge = DIETARY_BADGES[tag as keyof typeof DIETARY_BADGES];
                          return (
                            <span
                              key={tag}
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                                badge ? badge.color : 'bg-muted text-foreground border border-border'
                              }`}
                            >
                              {tag}
                            </span>
                          );
                        })}
                        {recipeTags.length > 3 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-foreground">
                            +{recipeTags.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Footer: Time breakdown and difficulty */}
                    <div className="flex items-center justify-between pt-3 border-t border-border text-sm">
                      <div className="flex items-center gap-3 text-muted-foreground">
                        {recipe.prepTime && (
                          <span className="flex items-center gap-1" title="Prep time">
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                              />
                            </svg>
                            {recipe.prepTime}m
                          </span>
                        )}
                        {recipe.cookTime && (
                          <span className="flex items-center gap-1" title="Cook time">
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
                              />
                            </svg>
                            {recipe.cookTime}m
                          </span>
                        )}
                      </div>

                      {/* Difficulty */}
                      {difficulty && (
                        <div className={`flex items-center gap-1 font-medium ${difficulty.color}`}>
                          <span className="text-xs" aria-hidden="true">{difficulty.icon}</span>
                          <span className="text-xs">{difficulty.label}</span>
                        </div>
                      )}
                    </div>

                    {/* Recipe Creator / Author Attribution */}
                    {recipe.author && (
                      <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary flex-shrink-0 overflow-hidden">
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
                        <span className="truncate">
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
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={20}
        itemCount={recipes.length}
        onPageChange={(p) => loadRecipes(p)}
        onLoadMore={() => loadRecipes(page + 1, true)}
        isLoading={isRefreshing}
      />

      {/* Floating Bulk Action Bar — only while doing bulk actions */}
      {bulkSelectMode && selectedRecipes.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-primary/30 bg-card/95 backdrop-blur-sm shadow-selection">
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-foreground">
                {selectedRecipes.size} recipe(s) selected
              </span>
              <button
                onClick={() => setSelectedRecipes(new Set())}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Clear selection
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowBulkEdit(true)}
                className="rounded-lg bg-background border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent shadow-sm transition-all"
              >
                Add Tags/Categories
              </button>
              <button
                onClick={() => setShowAddToCollection(true)}
                className="rounded-lg bg-background border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent shadow-sm transition-all"
              >
                Add to Collection
              </button>
              <button
                onClick={handleBulkDelete}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 shadow-sm transition-all"
              >
                Delete Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Collection Dialog */}
      {showAddToCollection && (
        <AddToCollectionDialog
          recipeIds={Array.from(selectedRecipes)}
          onClose={() => setShowAddToCollection(false)}
          onAdded={() => exitBulkSelectMode()}
        />
      )}
    </div>
  );
}

