import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RecipesPage from './RecipesPage';
import { recipeApi, taxonomyApi, historyApi, suggestionApi } from '@/services/api';
import { useConfirmStore } from '@/store/confirm.store';
import type { Recipe } from '@nommable/shared';

vi.mock('@/services/api', () => ({
  recipeApi: {
    getAll: vi.fn(),
    bulkDelete: vi.fn(),
    bulkUpdate: vi.fn(),
  },
  taxonomyApi: { getAll: vi.fn() },
  historyApi: { getRecent: vi.fn() },
  suggestionApi: { get: vi.fn() },
  collectionApi: { getAll: vi.fn(), addRecipes: vi.fn() },
}));

vi.mock('@/hooks/useAIStatus', () => ({
  useAIStatus: () => ({ isReady: false, isLoading: false }),
  aiNotConfiguredClass: '',
  AISetupBadge: () => null,
}));

const mockedRecipeApi = vi.mocked(recipeApi);

function makeRecipe(n: number): Recipe {
  return {
    id: `r${n}`,
    userId: 'u1',
    title: `Recipe ${n}`,
    description: `Description ${n}`,
    servings: 4,
    prepTime: 10,
    cookTime: 20,
    difficulty: 'easy',
    imageUrl: `https://example.com/r${n}.jpg`,
    ingredients: [],
    instructions: ['Cook it.'],
    categories: ['Dinner'],
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const RECIPES = [1, 2, 3, 4, 5, 6].map(makeRecipe);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/recipes']}>
      <Routes>
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/recipes/:id" element={<div>Recipe detail stub</div>} />
        <Route path="/collections" element={<div>Collections stub</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function checkboxFor(n: number) {
  return screen.getByRole('checkbox', { name: `Select recipe: Recipe ${n}` });
}

async function renderWithRecipes() {
  const utils = renderPage();
  await screen.findByText('Recipe 1');
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useConfirmStore.setState({ request: null });
  mockedRecipeApi.getAll.mockResolvedValue({
    data: RECIPES,
    total: RECIPES.length,
    totalPages: 1,
    page: 1,
  } as any);
  mockedRecipeApi.bulkDelete.mockResolvedValue(undefined as any);
  mockedRecipeApi.bulkUpdate.mockResolvedValue(undefined as any);
  vi.mocked(taxonomyApi).getAll.mockResolvedValue({ data: [] } as any);
  vi.mocked(historyApi).getRecent.mockResolvedValue([] as any);
  vi.mocked(suggestionApi).get.mockResolvedValue([] as any);
});

describe('RecipesPage selection rework (#90)', () => {
  it('has no Select/Done mode button', async () => {
    await renderWithRecipes();
    expect(
      screen.queryByRole('button', { name: 'Select recipes for bulk actions' })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Exit bulk select mode' })).toBeNull();
  });

  it('checkboxes are hover-reveal only while browsing (opacity-0 + group-hover)', async () => {
    await renderWithRecipes();
    const cb = checkboxFor(1);
    expect(cb).toHaveAttribute('aria-checked', 'false');
    expect(cb.className).toContain('opacity-0');
    expect(cb.className).toContain('group-hover:opacity-100');
    expect(cb.className).toContain('pointer-events-none');
  });

  it('clicking a checkbox enters selection mode: all checkboxes visible, bulk bar shows', async () => {
    await renderWithRecipes();
    fireEvent.click(checkboxFor(2));
    expect(checkboxFor(2)).toHaveAttribute('aria-checked', 'true');
    // every checkbox is now always visible
    for (const n of [1, 2, 3]) {
      expect(checkboxFor(n).className).toContain('opacity-100');
      expect(checkboxFor(n).className).not.toContain('pointer-events-none');
    }
    expect(await screen.findByText('1 recipe(s) selected')).toBeInTheDocument();
    // aria-live announcement
    expect(screen.getByText('1 recipe selected')).toBeInTheDocument();
  });

  it('unchecking the last selected recipe exits selection mode', async () => {
    await renderWithRecipes();
    fireEvent.click(checkboxFor(1));
    expect(await screen.findByText('1 recipe(s) selected')).toBeInTheDocument();
    fireEvent.click(checkboxFor(1));
    await waitFor(() =>
      expect(screen.queryByText('1 recipe(s) selected')).toBeNull()
    );
    expect(checkboxFor(1).className).toContain('opacity-0');
  });

  it('in selection mode, clicking a card toggles it instead of navigating', async () => {
    await renderWithRecipes();
    fireEvent.click(checkboxFor(1));
    await screen.findByText('1 recipe(s) selected');
    fireEvent.click(screen.getByText('Recipe 3'));
    expect(checkboxFor(3)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('2 recipe(s) selected')).toBeInTheDocument();
    // and we did not navigate away
    expect(screen.queryByText('Recipe detail stub')).toBeNull();
  });

  it('in browse mode, clicking a card still navigates to the recipe', async () => {
    await renderWithRecipes();
    fireEvent.click(screen.getByText('Recipe 4'));
    expect(await screen.findByText('Recipe detail stub')).toBeInTheDocument();
  });

  it('Esc exits selection mode', async () => {
    await renderWithRecipes();
    fireEvent.click(checkboxFor(1));
    await screen.findByText('1 recipe(s) selected');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByText('1 recipe(s) selected')).toBeNull()
    );
    expect(checkboxFor(1)).toHaveAttribute('aria-checked', 'false');
  });

  it('shift-click selects the range from the anchor', async () => {
    await renderWithRecipes();
    fireEvent.click(checkboxFor(2));
    await screen.findByText('1 recipe(s) selected');
    fireEvent.click(checkboxFor(5), { shiftKey: true });
    expect(screen.getByText('4 recipe(s) selected')).toBeInTheDocument();
    for (const n of [2, 3, 4, 5]) {
      expect(checkboxFor(n)).toHaveAttribute('aria-checked', 'true');
    }
    expect(checkboxFor(1)).toHaveAttribute('aria-checked', 'false');
    expect(checkboxFor(6)).toHaveAttribute('aria-checked', 'false');
  });

  it('"Select page (N)" in the bulk bar selects the whole page', async () => {
    await renderWithRecipes();
    fireEvent.click(checkboxFor(1));
    await screen.findByText('1 recipe(s) selected');
    fireEvent.click(screen.getByRole('button', { name: 'Select page (6)' }));
    expect(screen.getByText('6 recipe(s) selected')).toBeInTheDocument();
  });

  it('the bulk bar clear (✕) button clears the selection and exits the mode', async () => {
    await renderWithRecipes();
    fireEvent.click(checkboxFor(1));
    fireEvent.click(checkboxFor(2));
    await screen.findByText('2 recipe(s) selected');
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    await waitFor(() =>
      expect(screen.queryByText('2 recipe(s) selected')).toBeNull()
    );
    expect(checkboxFor(1).className).toContain('opacity-0');
  });

  it('bulk bar floats above the mobile tab bar (bottom-24 on mobile)', async () => {
    await renderWithRecipes();
    fireEvent.click(checkboxFor(1));
    const count = await screen.findByText('1 recipe(s) selected');
    const bar = count.closest('.fixed');
    expect(bar?.className).toContain('bottom-24');
    expect(bar?.className).toContain('lg:bottom-6');
  });

  it('long-press (touch, 500ms) enters selection mode with the card selected', async () => {
    await renderWithRecipes();
    const card = screen.getByText('Recipe 2').closest('.group');
    expect(card).not.toBeNull();
    fireEvent.pointerDown(card as Element, { pointerType: 'touch', clientX: 10, clientY: 10 });
    // not yet — the press hasn't reached 500ms
    expect(checkboxFor(2)).toHaveAttribute('aria-checked', 'false');
    await waitFor(
      () => expect(checkboxFor(2)).toHaveAttribute('aria-checked', 'true'),
      { timeout: 2500 }
    );
    expect(await screen.findByText('1 recipe(s) selected')).toBeInTheDocument();
    // the trailing click after a long-press is swallowed, not a toggle-off
    fireEvent.pointerUp(card as Element, { pointerType: 'touch' });
    fireEvent.click(card as Element);
    expect(checkboxFor(2)).toHaveAttribute('aria-checked', 'true');
  });

  it('a tap on another card after a long-press is not swallowed', async () => {
    await renderWithRecipes();
    const card = screen.getByText('Recipe 2').closest('.group');
    fireEvent.pointerDown(card as Element, { pointerType: 'touch', clientX: 10, clientY: 10 });
    await waitFor(
      () => expect(checkboxFor(2)).toHaveAttribute('aria-checked', 'true'),
      { timeout: 2500 }
    );
    // No click ever lands on the long-pressed card (the browser turned the
    // gesture into a suppressed context menu). The next tap — on a different
    // card's checkbox — must still work.
    fireEvent.click(checkboxFor(4));
    expect(checkboxFor(4)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('2 recipe(s) selected')).toBeInTheDocument();
  });

  it('a mouse press-and-hold does NOT trigger long-press selection', async () => {
    await renderWithRecipes();
    const card = screen.getByText('Recipe 2').closest('.group');
    fireEvent.pointerDown(card as Element, { pointerType: 'mouse', clientX: 10, clientY: 10 });
    await new Promise((r) => setTimeout(r, 600));
    expect(checkboxFor(2)).toHaveAttribute('aria-checked', 'false');
  });

  it('changing the search query clears the selection', async () => {
    await renderWithRecipes();
    fireEvent.click(checkboxFor(1));
    await screen.findByText('1 recipe(s) selected');
    fireEvent.change(screen.getByLabelText('Search recipes'), {
      target: { value: 'soup' },
    });
    await waitFor(() =>
      expect(screen.queryByText('1 recipe(s) selected')).toBeNull()
    );
  });

  it('delete flow is unchanged: count-stating confirm, then bulkDelete', async () => {
    await renderWithRecipes();
    fireEvent.click(checkboxFor(1));
    fireEvent.click(checkboxFor(3));
    await screen.findByText('2 recipe(s) selected');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Selected' }));
    // the confirm store received the count-stating request
    await waitFor(() =>
      expect(useConfirmStore.getState().request?.title).toBe('Delete 2 recipes?')
    );
    expect(useConfirmStore.getState().request?.message).toContain('2 recipes');
    useConfirmStore.getState().resolve(true);
    await waitFor(() =>
      expect(mockedRecipeApi.bulkDelete).toHaveBeenCalledWith(['r1', 'r3'])
    );
    await waitFor(() =>
      expect(screen.queryByText('2 recipe(s) selected')).toBeNull()
    );
  });

  it('hint chip shows on first visit and dismiss persists to localStorage', async () => {
    await renderWithRecipes();
    const tip = screen.getByText(/press-and-hold a recipe to select several/);
    expect(tip).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss tip' }));
    expect(screen.queryByText(/press-and-hold a recipe/)).toBeNull();
    expect(localStorage.getItem('nommable:recipes-select-hint')).toBe('dismissed');
  });

  it('hint chip auto-dismisses once selection mode is entered', async () => {
    await renderWithRecipes();
    expect(screen.getByText(/press-and-hold a recipe/)).toBeInTheDocument();
    fireEvent.click(checkboxFor(1));
    await screen.findByText('1 recipe(s) selected');
    expect(screen.queryByText(/press-and-hold a recipe/)).toBeNull();
    expect(localStorage.getItem('nommable:recipes-select-hint')).toBe('dismissed');
  });

  it('hint chip stays hidden when previously dismissed', async () => {
    localStorage.setItem('nommable:recipes-select-hint', 'dismissed');
    await renderWithRecipes();
    expect(screen.queryByText(/press-and-hold a recipe/)).toBeNull();
  });

  it('bulk bar contains the existing actions (tags/categories, collection, delete)', async () => {
    await renderWithRecipes();
    fireEvent.click(checkboxFor(1));
    await screen.findByText('1 recipe(s) selected');
    const bar = screen.getByText('1 recipe(s) selected').closest('.fixed') as HTMLElement;
    expect(within(bar).getByRole('button', { name: 'Add Tags/Categories' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Add to Collection' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Delete Selected' })).toBeInTheDocument();
  });
});
