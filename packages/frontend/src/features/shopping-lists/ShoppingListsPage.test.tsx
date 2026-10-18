import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import ShoppingListsPage from './ShoppingListsPage';
import { MealPlanShoppingListIntegration } from '../meal-plans/MealPlanShoppingListIntegration';
import { shoppingListApi, mealPlanApi } from '@/services/api';

vi.mock('@/services/api', () => ({
  shoppingListApi: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    toggleItem: vi.fn(),
  },
  mealPlanApi: {
    getMissingIngredients: vi.fn(),
    addToShoppingList: vi.fn(),
  },
}));

const mockedShoppingListApi = vi.mocked(shoppingListApi);
const mockedMealPlanApi = vi.mocked(mealPlanApi);

const list1 = {
  id: 'list-1',
  userId: 'user-1',
  name: 'Weekly Groceries',
  items: [
    {
      id: 'item-1',
      shoppingListId: 'list-1',
      name: 'Milk',
      quantity: 1,
      unit: 'L',
      category: 'Dairy',
      checked: false,
      order: 0,
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const list2 = {
  id: 'list-2',
  userId: 'user-1',
  name: 'Meal Plan Ingredients',
  items: [
    {
      id: 'item-2',
      shoppingListId: 'list-2',
      name: 'Pasta',
      quantity: 500,
      unit: 'g',
      category: 'Pantry',
      checked: false,
      order: 0,
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

function renderShoppingLists(initialEntry: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: initialEntry, state }]}>
      <Routes>
        <Route path="/shopping-lists" element={<ShoppingListsPage />} />
        <Route path="/shopping-lists/:id" element={<ShoppingListsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ShoppingListsPage /shopping-lists/:id routing (issue #54)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedShoppingListApi.getAll.mockResolvedValue({
      data: [list1, list2],
      total: 2,
      totalPages: 1,
      page: 1,
      pageSize: 20,
    } as any);
  });

  it('selects the list addressed by the URL id instead of the first list', async () => {
    renderShoppingLists('/shopping-lists/list-2');

    // Only the addressed list's items render in the detail view.
    await waitFor(() => expect(screen.getByText(/Pasta/)).toBeTruthy());
    expect(screen.queryByText(/Milk/)).toBeNull();
  });

  it('selects the first list on plain /shopping-lists', async () => {
    renderShoppingLists('/shopping-lists');

    await waitFor(() => expect(screen.getByText(/Milk/)).toBeTruthy());
    expect(screen.queryByText(/Pasta/)).toBeNull();
  });

  it('falls back to the first list for an unknown id instead of a blank page', async () => {
    renderShoppingLists('/shopping-lists/does-not-exist');

    await waitFor(() => expect(screen.getByText(/Milk/)).toBeTruthy());
  });

  it('still honors navigation state selectedListId when the URL has no id', async () => {
    renderShoppingLists('/shopping-lists', { selectedListId: 'list-2' });

    await waitFor(() => expect(screen.getByText(/Pasta/)).toBeTruthy());
    expect(screen.queryByText(/Milk/)).toBeNull();
  });

  it('keeps the URL in sync when picking another list in the sidebar', async () => {
    let observedPath = '';
    function LocationSpy() {
      observedPath = useLocation().pathname;
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/shopping-lists']}>
        <LocationSpy />
        <Routes>
          <Route path="/shopping-lists" element={<ShoppingListsPage />} />
          <Route path="/shopping-lists/:id" element={<ShoppingListsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/Milk/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Select Meal Plan Ingredients' }));

    await waitFor(() => expect(observedPath).toBe('/shopping-lists/list-2'));
    expect(screen.getByText(/Pasta/)).toBeTruthy();
  });
});

describe('MealPlanShoppingListIntegration add-to-shopping-list flow (issue #54)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedMealPlanApi.getMissingIngredients.mockResolvedValue({
      data: {
        missingIngredients: [
          {
            name: 'Pasta',
            quantity: 500,
            unit: 'g',
            recipeTitle: 'Spaghetti',
            recipeId: 'recipe-1',
          },
        ],
      },
    } as any);
    mockedMealPlanApi.addToShoppingList.mockResolvedValue({
      data: {
        message: 'Added to shopping list',
        shoppingList: { id: 'list-2' },
      },
    } as any);
  });

  it('navigates to /shopping-lists/<id>, which the router now serves', async () => {
    let observedPath = '';
    function LocationSpy() {
      observedPath = useLocation().pathname;
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/meal-plans/plan-1']}>
        <LocationSpy />
        <Routes>
          <Route
            path="/meal-plans/:id"
            element={<MealPlanShoppingListIntegration mealPlanId="plan-1" />}
          />
          <Route path="/shopping-lists/:id" element={<div>shopping list detail</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Check Missing Ingredients/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Add to Shopping List/i })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('button', { name: /Add to Shopping List/i }));

    await waitFor(() => expect(observedPath).toBe('/shopping-lists/list-2'));
    expect(screen.getByText('shopping list detail')).toBeTruthy();
  });
});
