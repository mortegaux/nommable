import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Fuse from 'fuse.js';
import { shoppingListApi } from '@/services/api';
import { CelebrationIcon } from '@/components/icons/MaterialIcon';
import { Pagination } from '@/components/Pagination';
import type { ShoppingList, ShoppingListItem, ShoppingListSearchQuery } from '@nommable/shared';
import { useConfirmStore } from '@/store/confirm.store';
import { useToastStore } from '@/store/toast.store';

const AISLE_CATEGORIES = [
  { name: 'Produce', dot: 'bg-green-500' },
  { name: 'Dairy', dot: 'bg-blue-500' },
  { name: 'Meat', dot: 'bg-red-500' },
  { name: 'Seafood', dot: 'bg-cyan-500' },
  { name: 'Bakery', dot: 'bg-amber-500' },
  { name: 'Pantry', dot: 'bg-orange-500' },
  { name: 'Frozen', dot: 'bg-indigo-500' },
  { name: 'Beverages', dot: 'bg-purple-500' },
  { name: 'Snacks', dot: 'bg-yellow-500' },
  { name: 'Other', dot: 'bg-gray-400' },
];

// Fixed aisle order so categories always scan in store-flow order.
const CATEGORY_ORDER = new Map(AISLE_CATEGORIES.map((c, i) => [c.name, i]));
const compareCategories = (a: string, b: string) =>
  (CATEGORY_ORDER.get(a) ?? 999) - (CATEGORY_ORDER.get(b) ?? 999);

const categoryDot = (category: string) =>
  AISLE_CATEGORIES.find((c) => c.name === category)?.dot ?? 'bg-gray-400';

// Keyword-based category guessing for the add-item form.
// Multi-word phrases are matched before single words so e.g. "ice cream"
// lands in Frozen rather than Dairy ("cream").
const CATEGORY_KEYWORDS: { category: string; keywords: string[] }[] = [
  {
    category: 'Dairy',
    keywords: [
      'sour cream', 'cream cheese', 'cottage cheese', 'whipped cream', 'half and half', 'buttermilk',
      'milk', 'cheese', 'butter', 'yogurt', 'yoghurt', 'cream', 'creamer', 'egg', 'eggs',
      'mozzarella', 'cheddar', 'parmesan', 'gouda', 'brie', 'feta', 'ricotta', 'kefir',
    ],
  },
  {
    category: 'Produce',
    keywords: [
      'green beans', 'bell pepper', 'brussels sprouts', 'sweet potato', 'sweet potatoes',
      'apple', 'apples', 'banana', 'bananas', 'orange', 'oranges', 'lettuce', 'tomato', 'tomatoes',
      'onion', 'onions', 'potato', 'potatoes', 'carrot', 'carrots', 'celery', 'cucumber', 'cucumbers',
      'spinach', 'kale', 'broccoli', 'cauliflower', 'garlic', 'ginger', 'lemon', 'lemons', 'lime', 'limes',
      'avocado', 'avocados', 'strawberry', 'strawberries', 'blueberry', 'blueberries',
      'raspberry', 'raspberries', 'grape', 'grapes', 'melon', 'watermelon', 'peach', 'peaches',
      'pear', 'pears', 'plum', 'plums', 'cabbage', 'zucchini', 'squash', 'mushroom', 'mushrooms',
      'asparagus', 'corn', 'peas', 'cilantro', 'parsley', 'basil', 'mint', 'dill', 'arugula',
      'leek', 'leeks', 'radish', 'radishes', 'beet', 'beets', 'artichoke', 'eggplant', 'okra',
      'pineapple', 'mango', 'kiwi', 'papaya', 'coconut', 'cherry', 'cherries', 'apricot', 'nectarine',
      'fig', 'figs', 'salad', 'herb', 'herbs',
    ],
  },
  {
    category: 'Meat',
    keywords: [
      'ground beef', 'ground turkey', 'chicken breast', 'chicken thigh', 'pork chop', 'deli meat',
      'chicken', 'beef', 'pork', 'turkey', 'bacon', 'sausage', 'ham', 'steak', 'steaks', 'ribs',
      'lamb', 'veal', 'tenderloin', 'brisket', 'pepperoni', 'salami', 'chorizo', 'duck',
    ],
  },
  {
    category: 'Seafood',
    keywords: [
      'fish', 'salmon', 'tuna', 'shrimp', 'cod', 'tilapia', 'crab', 'lobster', 'scallop', 'scallops',
      'mussel', 'mussels', 'clam', 'clams', 'oyster', 'oysters', 'sushi', 'sardine', 'sardines',
      'anchovy', 'halibut', 'trout', 'snapper', 'catfish',
    ],
  },
  {
    category: 'Bakery',
    keywords: [
      'hamburger bun', 'hot dog bun', 'english muffin',
      'bread', 'bagel', 'bagels', 'croissant', 'muffin', 'muffins', 'donut', 'donuts', 'doughnut',
      'baguette', 'tortilla', 'tortillas', 'pita', 'roll', 'rolls', 'cake', 'pie', 'pastry',
      'pastries', 'biscuit', 'biscuits', 'scone', 'scones', 'focaccia', 'ciabatta', 'naan',
    ],
  },
  {
    category: 'Frozen',
    keywords: [
      'ice cream', 'frozen meal', 'tv dinner',
      'frozen', 'popsicle', 'popsicles', 'gelato', 'sorbet', 'sherbet', 'pizza', 'waffle', 'waffles',
    ],
  },
  {
    category: 'Beverages',
    keywords: [
      'sparkling water', 'energy drink', 'sports drink', 'orange juice', 'apple juice',
      'coffee', 'tea', 'chai', 'espresso', 'latte', 'cappuccino', 'juice', 'soda', 'cola',
      'water', 'seltzer', 'lemonade', 'kombucha', 'beer', 'wine', 'gatorade',
    ],
  },
  {
    category: 'Snacks',
    keywords: [
      'trail mix', 'granola bar', 'fruit snack', 'rice cake',
      'potato chips', 'tortilla chips', 'pita chips', 'corn chips', 'kettle chips',
      'chips', 'crackers', 'pretzel', 'pretzels', 'popcorn', 'nuts', 'almonds', 'peanuts', 'cashews',
      'granola', 'chocolate', 'candy', 'cookie', 'cookies', 'hummus', 'salsa', 'dip', 'guacamole',
      'jerky', 'goldfish',
    ],
  },
  {
    category: 'Pantry',
    keywords: [
      'olive oil', 'peanut butter', 'almond butter', 'baking powder', 'baking soda', 'maple syrup',
      'black pepper', 'chili powder', 'garlic powder', 'onion powder', 'bay leaf', 'coconut milk',
      'soy sauce', 'hot sauce', 'bbq sauce',
      'chicken broth', 'beef broth', 'vegetable broth', 'chicken stock', 'beef stock', 'vegetable stock',
      'flour', 'sugar', 'salt', 'rice', 'pasta', 'spaghetti', 'macaroni',
      'rotini', 'penne', 'fusilli', 'farfalle', 'rigatoni', 'ziti', 'linguine', 'fettuccine',
      'orzo', 'lasagna', 'lasagne', 'elbows', 'elbow', 'shells', 'bowtie', 'bow ties',
      'angel hair', 'vermicelli', 'couscous', 'gnocchi', 'noodles', 'noodle',
      'cereal', 'oatmeal', 'oats', 'beans', 'lentils', 'chickpeas', 'canned', 'soup', 'broth', 'stock',
      'sauce', 'marinara', 'ketchup', 'mustard', 'mayonnaise', 'mayo', 'cinnamon', 'cumin', 'paprika',
      'oregano', 'turmeric', 'curry', 'vanilla', 'yeast', 'cornstarch', 'breadcrumbs', 'syrup',
      'jam', 'jelly', 'preserves', 'olives', 'pickles', 'capers', 'pepper',
    ],
  },
];

// Flattened keyword → category index for Fuse.js fuzzy matching.
// Fuse handles typos ("potatoe" → "potato") via Bitap approximate matching,
// so we don't hand-roll edit distance or stemming.
const CATEGORY_ENTRIES: { keyword: string; category: string }[] = CATEGORY_KEYWORDS.flatMap(
  ({ category, keywords }) => keywords.map((keyword) => ({ keyword, category })),
);

const categoryFuse = new Fuse(CATEGORY_ENTRIES, {
  keys: ['keyword'],
  threshold: 0.4, // 0 = exact, 1 = anything. 0.4 tolerates 1-2 typos on short words.
  includeScore: true,
  ignoreLocation: true, // Match anywhere in the keyword, not just the start.
});

function guessCategory(itemName: string): string {
  const text = itemName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  if (!text) return 'Other';
  // Generate all contiguous word phrases so "potato chips" is tried as a
  // whole phrase, not just as "potato" + "chips" separately.
  const words = text.split(/\s+/);
  const phrases: string[] = [];
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j <= words.length; j++) {
      phrases.push(words.slice(i, j).join(' '));
    }
  }
  // Best match = lowest Fuse score; exact ties break toward the longer
  // keyword so "potato chips" (Snacks) beats "potato" (Produce).
  // Scores are rounded to 3 decimals first — Fuse's "perfect" matches
  // come back as floating-point noise (2e-16, 8e-12), not exact zeros.
  let bestCategory: string | null = null;
  let bestScore = Infinity;
  let bestLength = 0;
  for (const phrase of phrases) {
    const results = categoryFuse.search(phrase);
    if (results.length === 0) continue;
    const top = results[0];
    const score = Math.round((top.score ?? 1) * 1000) / 1000;
    const keywordLength = top.item.keyword.length;
    if (score < bestScore || (score === bestScore && keywordLength > bestLength)) {
      bestCategory = top.item.category;
      bestScore = score;
      bestLength = keywordLength;
    }
  }
  return bestCategory ?? 'Other';
}

function ChevronDown({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// One dense item row (~44px): category dot, checkbox, name, hover-reveal delete.
function ItemRow({
  item,
  onToggle,
  onDelete,
}: {
  item: ShoppingListItem;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-2.5 border-b border-border/50 px-2 py-2 transition-colors last:border-b-0 hover:bg-accent/40">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${categoryDot(item.category || 'Other')}`}
        aria-hidden="true"
      />
      <input
        type="checkbox"
        checked={item.checked}
        onChange={onToggle}
        className="h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-current focus:ring-2 focus:ring-primary focus:ring-offset-2"
        aria-label={`Mark ${item.name} as ${item.checked ? 'unchecked' : 'checked'}`}
      />
      <span
        className={`min-w-0 flex-1 cursor-pointer text-sm ${
          item.checked ? 'text-muted-foreground line-through' : 'text-foreground'
        }`}
        onClick={onToggle}
      >
        {item.quantity && `${item.quantity} `}
        {item.unit && `${item.unit} `}
        {item.name}
      </span>
      {item.notes && (
        <span className="hidden truncate text-xs italic text-muted-foreground sm:inline">
          {item.notes}
        </span>
      )}
      <button
        onClick={onDelete}
        className="shrink-0 p-1 text-muted-foreground opacity-60 transition-all hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
        title="Delete item"
        aria-label={`Delete ${item.name}`}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default function ShoppingListsPageEnhanced() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id: listIdParam } = useParams();
  // The list addressed by the URL wins; navigation state (e.g. from the
  // meal-plan "Add to Shopping List" flow) is the fallback for plain
  // /shopping-lists links that carry a selectedListId.
  const targetListId = listIdParam ?? (location.state as any)?.selectedListId;
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const confirm = useConfirmStore((s) => s.confirm);
  const toast = useToastStore();
  const [selectedList, setSelectedList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Other');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const quickAddRef = useRef<HTMLInputElement>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [showCompleted, setShowCompleted] = useState(false);
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [editingListName, setEditingListName] = useState(false);
  const [editedListName, setEditedListName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const loadShoppingLists = useCallback(async (pageNum: number, append = false) => {
    try {
      const params: ShoppingListSearchQuery = {
        page: pageNum,
        pageSize: 20,
      };
      const result = await shoppingListApi.getAll(params);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setPage(result.page);
      if (append) {
        setShoppingLists((prev) => [...prev, ...result.data]);
      } else {
        setShoppingLists(result.data);
      }
    } catch (error) {
      console.error('Failed to load shopping lists:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    loadShoppingLists(1);
  }, [loadShoppingLists]);

  useEffect(() => {
    if (shoppingLists.length === 0) return;
    if (targetListId) {
      const addressed = shoppingLists.find((list) => list.id === targetListId);
      if (addressed) {
        // Honor the addressed list even if another list is already selected
        // (covers back/forward navigation and direct links).
        if (selectedList?.id !== addressed.id) setSelectedList(addressed);
      } else if (!selectedList) {
        // Unknown id (e.g. stale bookmark): show the first list rather
        // than a blank page. Never 404s on this route.
        setSelectedList(shoppingLists[0]);
      }
    } else if (!selectedList) {
      setSelectedList(shoppingLists[0]);
    }
  }, [shoppingLists, selectedList, targetListId]);

  // Keep the URL in sync with the selected list so refresh / share /
  // back-button all land on the list actually being viewed.
  const handleSelectList = (list: ShoppingList) => {
    setSelectedList(list);
    navigate(`/shopping-lists/${list.id}`, { replace: true });
  };

  // Reset section collapse state when switching lists.
  useEffect(() => {
    setCollapsedCategories({});
    setShowCompleted(false);
  }, [selectedList?.id]);

  const handleToggleItem = async (listId: string, itemId: string) => {
    try {
      await shoppingListApi.toggleItem(listId, itemId);

      // Optimistically update UI
      setShoppingLists(lists =>
        lists.map(list =>
          list.id === listId
            ? {
                ...list,
                items: list.items.map(item =>
                  item.id === itemId ? { ...item, checked: !item.checked } : item
                ),
              }
            : list
        )
      );

      if (selectedList?.id === listId) {
        setSelectedList(prev => prev ? {
          ...prev,
          items: prev.items.map(item =>
            item.id === itemId ? { ...item, checked: !item.checked } : item
          ),
        } : null);
      }
    } catch (error) {
      console.error('Failed to toggle item:', error);
      // Reload on error
      loadShoppingLists(page);
    }
  };

  const handleItemNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewItemName(value);
    // Auto-guess the category from the item name unless the user already
    // picked a category manually for this item.
    if (!categoryTouched) {
      setNewItemCategory(guessCategory(value));
    }
  };

  const handleItemCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNewItemCategory(e.target.value);
    setCategoryTouched(true);
  };

  // Shared add-item core: the detail view renders from selectedList, so the
  // update response is applied to both states and the new item appears
  // instantly without a refresh.
  const addItem = async (
    name: string,
    opts?: { quantity?: number; unit?: string; category?: string }
  ): Promise<boolean> => {
    if (!selectedList || !name.trim()) return false;
    const itemName = name.trim();

    try {
      const items = [
        ...selectedList.items,
        {
          name: itemName,
          quantity: opts?.quantity,
          unit: opts?.unit || undefined,
          category: opts?.category ?? 'Other',
          checked: false,
          order: selectedList.items.length,
        },
      ];

      const response = await shoppingListApi.update(selectedList.id, { items });
      const updatedList = response.data;
      setShoppingLists((lists) =>
        lists.map((list) => (list.id === updatedList.id ? updatedList : list))
      );
      setSelectedList(updatedList);

      toast.success(`Added ${itemName}`);
      return true;
    } catch (error) {
      console.error('Failed to add item:', error);
      return false;
    }
  };

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await addItem(newItemName, {
      quantity: newItemQuantity ? parseFloat(newItemQuantity) : undefined,
      unit: newItemUnit || undefined,
      category: newItemCategory,
    });
    if (!ok) return;

    // Reset for the next item and keep the input focused for rapid entry.
    setNewItemName('');
    setNewItemQuantity('');
    setNewItemUnit('');
    setNewItemCategory('Other');
    setCategoryTouched(false);
    quickAddRef.current?.focus();
  };

  const handleAddRecent = async (name: string) => {
    await addItem(name, { category: guessCategory(name) });
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    try {
      const response = await shoppingListApi.create({
        name: newListName,
        items: [],
      });
      await loadShoppingLists(1);
      setSelectedList(response.data);
      setNewListName('');
      setShowCreateListModal(false);
    } catch (error) {
      console.error('Failed to create shopping list:', error);
    }
  };

  const handleDeleteList = async (listId: string) => {
    const list = shoppingLists.find((l) => l.id === listId);
    const ok = await confirm({
      title: 'Delete shopping list?',
      message: `Permanently delete "${list?.name ?? 'this list'}"? This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;

    try {
      await shoppingListApi.delete(listId);
    } catch (error) {
      // The server may have processed the delete even though the response
      // never made it back (dropped connection / proxy hiccup). A 404 on
      // re-fetch proves the list is gone — treat that as success instead of
      // alarming the user with a false failure.
      const gone = await shoppingListApi
        .getById(listId)
        .then(
          () => false,
          (verifyError: any) => verifyError?.response?.status === 404
        );
      if (!gone) {
        console.error('Failed to delete shopping list:', error);
        toast.error('Failed to delete shopping list. Please try again.');
        return;
      }
    }

    // Update both states together from the same computed list. Setting
    // selectedList to null and letting the auto-select effect re-pick would
    // race: the effect fires with the stale shoppingLists (still containing
    // the deleted list) before the reload completes, re-selecting it.
    const remaining = shoppingLists.filter((l) => l.id !== listId);
    setShoppingLists(remaining);
    if (selectedList?.id === listId) {
      setSelectedList(remaining[0] ?? null);
    }
    await loadShoppingLists(page);
    toast.success('Shopping list deleted.');
  };

  const handleRenameList = async () => {
    if (!selectedList) return;
    if (!editedListName.trim()) {
      setRenameError('Name is required');
      return;
    }
    setRenameError('');

    try {
      const response = await shoppingListApi.update(selectedList.id, { name: editedListName });
      const updatedList = response.data;
      setShoppingLists((lists) =>
        lists.map((list) => (list.id === updatedList.id ? updatedList : list))
      );
      setSelectedList(updatedList);
      setEditingListName(false);
      setEditedListName('');
    } catch (error) {
      console.error('Failed to rename shopping list:', error);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!selectedList) return;

    const syncList = (list: ShoppingList) => {
      setShoppingLists((lists) =>
        lists.map((l) => (l.id === list.id ? list : l))
      );
      setSelectedList(list);
    };

    try {
      const items = selectedList.items.filter(item => item.id !== itemId);
      const response = await shoppingListApi.update(selectedList.id, { items });
      syncList(response.data);
    } catch (error) {
      // The update may have succeeded despite the failed response — verify
      // against the server before reporting failure.
      try {
        const { data: fresh } = await shoppingListApi.getById(selectedList.id);
        if (!(fresh.items ?? []).some((item) => item.id === itemId)) {
          syncList(fresh);
          return;
        }
      } catch {
        // Verification itself failed; fall through to the error toast.
      }
      console.error('Failed to delete item:', error);
      toast.error('Failed to delete item. Please try again.');
    }
  };

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  // Active vs completed split; active items grouped by category in aisle order.
  const activeItems = useMemo(
    () => (selectedList ? selectedList.items.filter((i) => !i.checked) : []),
    [selectedList]
  );
  const completedItems = useMemo(
    () => (selectedList ? selectedList.items.filter((i) => i.checked) : []),
    [selectedList]
  );

  const groupedActive = useMemo(() => {
    const groups = new Map<string, ShoppingListItem[]>();
    for (const item of activeItems) {
      const category = item.category || 'Other';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(item);
    }
    return [...groups.entries()].sort(([a], [b]) => compareCategories(a, b));
  }, [activeItems]);

  // Recent-item chips: unique names previously used in this list (most recent
  // first), excluding anything already on the active list. One tap re-adds.
  const recentNames = useMemo(() => {
    if (!selectedList) return [];
    const active = new Set(activeItems.map((i) => i.name.trim().toLowerCase()));
    const seen = new Set<string>();
    const recents: string[] = [];
    const byRecency = [...selectedList.items].sort((a, b) => b.order - a.order);
    for (const item of byRecency) {
      const key = item.name.trim().toLowerCase();
      if (!key || active.has(key) || seen.has(key)) continue;
      seen.add(key);
      recents.push(item.name.trim());
      if (recents.length >= 8) break;
    }
    return recents;
  }, [selectedList, activeItems]);

  const getProgress = (items: ShoppingListItem[]) => {
    if (items.length === 0) return 0;
    const checked = items.filter(item => item.checked).length;
    return Math.round((checked / items.length) * 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading shopping lists...</div>
      </div>
    );
  }

  if (shoppingLists.length === 0) {
    return (
      <>
        <div>
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Shopping Lists</h1>
              <p className="text-muted-foreground mt-1">0 shopping lists</p>
            </div>
            <button
              onClick={() => setShowCreateListModal(true)}
              className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Create new shopping list"
            >
              Create List
            </button>
          </div>
          <div className="rounded-lg border-2 border-dashed border-border bg-card p-12 text-center">
            <p className="text-muted-foreground">No shopping lists yet. Create your first list!</p>
          </div>
        </div>

        {/* Create List Modal */}
        {showCreateListModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateListModal(false)}
          >
            <div
              className="bg-card rounded-xl max-w-md w-full p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-foreground mb-4">Create Shopping List</h2>
              <form onSubmit={handleCreateList} className="space-y-4">
                <div>
                  <label htmlFor="listName" className="block text-sm font-medium text-foreground mb-2">
                    List Name
                  </label>
                  <input
                    id="listName"
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="e.g., Weekly Groceries"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    autoFocus
                    required
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateListModal(false);
                      setNewListName('');
                    }}
                    className="px-4 py-2 rounded-md border border-border bg-background text-foreground hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newListName.trim()}
                    className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Create List
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
    );
  }

  const progress = selectedList ? getProgress(selectedList.items) : 0;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Shopping Lists</h1>
          <p className="text-muted-foreground mt-1">{total}{' '}shopping list{total === 1 ? '' : 's'}</p>
        </div>
        <button
          onClick={() => setShowCreateListModal(true)}
          className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label="Create new shopping list"
        >
          Create List
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        {/* Shopping List Selector */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Your Lists
          </h2>
          {shoppingLists.map(list => {
            const listProgress = getProgress(list.items);
            return (
              <div
                key={list.id}
                className={`relative group w-full text-left p-3 rounded-lg border transition-all ${
                  selectedList?.id === list.id
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border bg-card hover:border-primary/30 hover:bg-accent/5'
                }`}
              >
                <button
                  onClick={() => handleSelectList(list)}
                  className="w-full text-left"
                  aria-label={`Select ${list.name}`}
                  aria-current={selectedList?.id === list.id}
                >
                  <div className="font-medium text-sm text-foreground mb-1 pr-6">{list.name}</div>
                  <div className="text-xs text-muted-foreground mb-2">
                    {list.items.length}{' '}items
                  </div>
                  <div className="w-full bg-background rounded-full h-1">
                    <div
                      className="bg-secondary h-1 rounded-full transition-all"
                      style={{ width: `${listProgress}%` }}
                      role="progressbar"
                      aria-valuenow={listProgress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${listProgress}% complete`}
                    />
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteList(list.id);
                  }}
                  className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                  title={`Delete list "${list.name}"`}
                  aria-label={`Delete shopping list ${list.name}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={20}
            itemCount={shoppingLists.length}
            onPageChange={(p) => loadShoppingLists(p)}
            onLoadMore={() => loadShoppingLists(page + 1, true)}
            isLoading={loading}
          />
        </div>

        {/* Selected List Detail */}
        {selectedList && (
          <div className="bg-card rounded-lg border border-border shadow-sm">
            {/* List Header with Progress */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                {editingListName ? (
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editedListName}
                        onChange={(e) => {
                          setEditedListName(e.target.value);
                          if (renameError && e.target.value.trim()) setRenameError('');
                        }}
                        aria-invalid={!!renameError}
                        aria-describedby={renameError ? 'rename-error' : undefined}
                        className="flex-1 text-xl font-bold px-2 py-1 border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameList();
                          if (e.key === 'Escape') {
                            setEditingListName(false);
                            setEditedListName('');
                            setRenameError('');
                          }
                        }}
                      />
                      <button
                        onClick={handleRenameList}
                        disabled={!editedListName.trim()}
                        className="px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingListName(false);
                          setEditedListName('');
                          setRenameError('');
                        }}
                        className="px-3 py-1 bg-background border border-border rounded hover:bg-accent"
                      >
                        Cancel
                      </button>
                    </div>
                    {renameError && (
                      <p id="rename-error" role="alert" className="text-sm text-destructive mt-1">
                        {renameError}
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-foreground">{selectedList.name}</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground mr-2">
                        {selectedList.items.filter(i => i.checked).length} / {selectedList.items.length}
                      </span>
                      <button
                        onClick={() => {
                          setEditingListName(true);
                          setEditedListName(selectedList.name);
                        }}
                        className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                        title="Rename list"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteList(selectedList.id)}
                        className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                        title={`Delete list "${selectedList.name}"`}
                        aria-label={`Delete shopping list ${selectedList.name}`}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-background rounded-full h-2 mb-1.5">
                <div
                  className="bg-secondary h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Shopping list ${progress}% complete`}
                />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {progress === 100 ? (
                  <>
                    <CelebrationIcon size={16} />
                    All done!
                  </>
                ) : (
                  `${progress}% complete`
                )}
              </p>
            </div>

            {/* Quick add — always visible, pinned while scrolling the list */}
            <div className="sticky top-0 z-10 border-b border-border bg-card px-3 py-2.5 sm:px-4">
              <form onSubmit={handleQuickAddSubmit} className="flex flex-wrap items-center gap-2">
                <input
                  ref={quickAddRef}
                  type="text"
                  value={newItemName}
                  onChange={handleItemNameChange}
                  placeholder="Add an item…"
                  aria-label="Item name"
                  className="min-w-[10rem] flex-[1_1_12rem] rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <input
                  type="number"
                  step="0.01"
                  value={newItemQuantity}
                  onChange={(e) => setNewItemQuantity(e.target.value)}
                  placeholder="Qty"
                  aria-label="Quantity"
                  className="w-16 rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <input
                  type="text"
                  value={newItemUnit}
                  onChange={(e) => setNewItemUnit(e.target.value)}
                  placeholder="Unit"
                  aria-label="Unit"
                  className="w-20 rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <select
                  value={newItemCategory}
                  onChange={handleItemCategoryChange}
                  aria-label="Category"
                  title={categoryTouched ? 'Category (chosen by you)' : 'Category (auto-guessed — change it if wrong)'}
                  className="max-w-[9rem] rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {AISLE_CATEGORIES.map(cat => (
                    <option key={cat.name} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!newItemName.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  Add
                </button>
              </form>
              {recentNames.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5 overflow-x-auto">
                  <span className="shrink-0 text-xs text-muted-foreground">Recent:</span>
                  {recentNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => handleAddRecent(name)}
                      className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
                      title={`Add ${name} to the list`}
                    >
                      + {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Items by Category */}
            <div className="px-2 py-2 sm:px-3">
              {activeItems.length === 0 && completedItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No items yet — add your first one above!
                </div>
              ) : (
                <div className="lg:columns-2 lg:gap-4 [&>*]:lg:break-inside-avoid">
                  {groupedActive.map(([category, items]) => {
                    const collapsed = !!collapsedCategories[category];
                    return (
                      <div key={category}>
                        <button
                          type="button"
                          onClick={() => toggleCategory(category)}
                          aria-expanded={!collapsed}
                          className="flex w-full items-center gap-2 rounded px-1 py-1.5 text-left transition-colors hover:bg-accent/40"
                        >
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${collapsed ? '-rotate-90' : ''}`}
                          />
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${categoryDot(category)}`}
                            aria-hidden="true"
                          />
                          <span className="text-sm font-semibold text-foreground">{category}</span>
                          <span className="text-xs text-muted-foreground">({items.length})</span>
                        </button>
                        {!collapsed && (
                          <div className="pl-1">
                            {items.map((item) => (
                              <ItemRow
                                key={item.id}
                                item={item}
                                onToggle={() => handleToggleItem(selectedList.id, item.id)}
                                onDelete={() => handleDeleteItem(item.id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Checked items sink into a collapsed "Completed" section */}
                  {completedItems.length > 0 && (
                    <div className="mt-1 border-t border-border pt-1 break-inside-avoid">
                      <button
                        type="button"
                        onClick={() => setShowCompleted((v) => !v)}
                        aria-expanded={showCompleted}
                        className="flex w-full items-center gap-2 rounded px-1 py-1.5 text-left transition-colors hover:bg-accent/40"
                      >
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${showCompleted ? '' : '-rotate-90'}`}
                        />
                        <span className="text-sm font-semibold text-muted-foreground">Completed</span>
                        <span className="text-xs text-muted-foreground">({completedItems.length})</span>
                      </button>
                      {showCompleted && (
                        <div className="pl-1">
                          {completedItems.map((item) => (
                            <ItemRow
                              key={item.id}
                              item={item}
                              onToggle={() => handleToggleItem(selectedList.id, item.id)}
                              onDelete={() => handleDeleteItem(item.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create List Modal */}
      {showCreateListModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowCreateListModal(false)}
        >
          <div
            className="bg-card rounded-xl max-w-md w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-foreground mb-4">Create Shopping List</h2>
            <form onSubmit={handleCreateList} className="space-y-4">
              <div>
                <label htmlFor="listName" className="block text-sm font-medium text-foreground mb-2">
                  List Name
                </label>
                <input
                  id="listName"
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="e.g., Weekly Groceries"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                  required
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateListModal(false);
                    setNewListName('');
                  }}
                  className="px-4 py-2 rounded-md border border-border bg-background text-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newListName.trim()}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Create List
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
