import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import KitchenTodayPage from './KitchenTodayPage';
import { mealPlanApi, pantryApi, batchCookingApi, shoppingListApi } from '@/services/api';

vi.mock('@/services/api', () => ({
  mealPlanApi: { getAll: vi.fn() },
  pantryApi: { getAll: vi.fn() },
  batchCookingApi: { getAll: vi.fn() },
  shoppingListApi: { getAll: vi.fn() },
}));

const mockedMealPlanApi = vi.mocked(mealPlanApi);
const mockedPantryApi = vi.mocked(pantryApi);
const mockedBatchCookingApi = vi.mocked(batchCookingApi);
const mockedShoppingListApi = vi.mocked(shoppingListApi);

function renderPage() {
  return render(
    <MemoryRouter>
      <KitchenTodayPage />
    </MemoryRouter>
  );
}

describe('KitchenTodayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the next action and every section from fetched data', async () => {
    mockedPantryApi.getAll.mockResolvedValue({
      data: [
        {
          id: 'i1',
          name: 'Milk',
          quantity: 1,
          unit: 'gallon',
          category: 'Dairy',
          expirationDate: new Date().toISOString(),
          isLowStock: true,
        },
      ],
    } as never);
    mockedMealPlanApi.getAll.mockResolvedValue({
      data: [
        {
          id: 'p1',
          name: 'This Week',
          meals: [
            {
              id: 'm1',
              mealPlanId: 'p1',
              recipeId: 'r1',
              date: new Date().toISOString(),
              mealType: 'dinner',
              servings: 2,
              recipe: { title: 'Tacos' },
            },
          ],
        },
      ],
    } as never);
    mockedBatchCookingApi.getAll.mockResolvedValue({
      data: [
        {
          id: 'b1',
          name: 'Chili Batch',
          cookingDate: new Date().toISOString().split('T')[0],
          status: 'in-progress',
          storageMethod: 'refrigerate',
          storageDuration: 4,
          prepChecklist: [{ task: 'Dice onions', completed: false, order: 1 }],
          recipe: { id: 'r2', title: 'Chili' },
        },
      ],
    } as never);
    mockedShoppingListApi.getAll.mockResolvedValue({ data: [] } as never);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
    // Expiring today outranks dinner in the next-action priority.
    expect(screen.getByText(/Use up the expiring item/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Tonight's plan/ })).toBeInTheDocument();
    expect(screen.getByText('Tacos')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Expiring soon/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Prep due/ })).toBeInTheDocument();
    expect(screen.getByText('Dice onions')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Low stock/ })).toBeInTheDocument();
    expect(screen.getByText(/Read-only view/)).toBeInTheDocument();
  });

  it('renders correct empty states when there is nothing to show', async () => {
    mockedPantryApi.getAll.mockResolvedValue({ data: [] } as never);
    mockedMealPlanApi.getAll.mockResolvedValue({ data: [] } as never);
    mockedBatchCookingApi.getAll.mockResolvedValue({ data: [] } as never);
    mockedShoppingListApi.getAll.mockResolvedValue({ data: [] } as never);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
    expect(screen.getByText('Plan this week’s meals')).toBeInTheDocument();
    expect(screen.getByText(/Nothing expiring in the next 7 days/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing flagged low stock/)).toBeInTheDocument();
  });

  it('always shows a shopping-lists link in Low stock, even with nothing to show', async () => {
    mockedPantryApi.getAll.mockResolvedValue({ data: [] } as never);
    mockedMealPlanApi.getAll.mockResolvedValue({ data: [] } as never);
    mockedBatchCookingApi.getAll.mockResolvedValue({ data: [] } as never);
    mockedShoppingListApi.getAll.mockResolvedValue({ data: [] } as never);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
    // Issue #37: the link used to render only when an active shopping list
    // existed, so the click-test found no restock link on an empty board.
    const restockLink = screen.getByRole('link', { name: 'View shopping lists' });
    expect(restockLink).toHaveAttribute('href', '/shopping-lists');
    expect(screen.getByText(/No active shopping lists/)).toBeInTheDocument();
  });

  it('labels the leftovers empty-state link as a view action, not a create action', async () => {
    mockedPantryApi.getAll.mockResolvedValue({ data: [] } as never);
    mockedMealPlanApi.getAll.mockResolvedValue({ data: [] } as never);
    mockedBatchCookingApi.getAll.mockResolvedValue({ data: [] } as never);
    mockedShoppingListApi.getAll.mockResolvedValue({ data: [] } as never);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
    // Issue #38: "Cook a batch" implied starting a new batch cook but landed
    // on the list page — batch creation is a modal on that page, not a route.
    expect(screen.queryByText('Cook a batch')).not.toBeInTheDocument();
    const viewLinks = screen.getAllByRole('link', { name: 'View batch cooking' });
    expect(viewLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of viewLinks) {
      expect(link).toHaveAttribute('href', '/batch-cooking');
    }
  });

  it('points the Coming Up links at the meal-plan pages', async () => {
    mockedPantryApi.getAll.mockResolvedValue({ data: [] } as never);
    mockedMealPlanApi.getAll.mockResolvedValue({ data: [] } as never);
    mockedBatchCookingApi.getAll.mockResolvedValue({ data: [] } as never);
    mockedShoppingListApi.getAll.mockResolvedValue({ data: [] } as never);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
    // Code-verified after the click-test could not reach these links
    // (session expired before they were clicked).
    const mealPlanLinks = screen.getAllByRole('link', { name: 'Meal plans' });
    expect(mealPlanLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of mealPlanLinks) {
      expect(link).toHaveAttribute('href', '/meal-plans');
    }
    const planMealLinks = screen.getAllByRole('link', { name: 'Plan a meal' });
    expect(planMealLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of planMealLinks) {
      expect(link).toHaveAttribute('href', '/meal-plans/new');
    }
  });

  it('shows a retry state when every data source fails', async () => {
    mockedPantryApi.getAll.mockRejectedValue(new Error('down'));
    mockedMealPlanApi.getAll.mockRejectedValue(new Error('down'));
    mockedBatchCookingApi.getAll.mockRejectedValue(new Error('down'));
    mockedShoppingListApi.getAll.mockRejectedValue(new Error('down'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Could not load today’s kitchen/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
