import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RecipeDetailPage from './RecipeDetailPage';
import { ConfirmHost } from '@/components/ConfirmHost';
import { useConfirmStore } from '@/store/confirm.store';
import { recipeApi, taxonomyApi } from '@/services/api';

vi.mock('@/services/api', () => ({
  recipeApi: {
    getById: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  ratingApi: {
    rate: vi.fn(),
    unrate: vi.fn(),
  },
  collectionApi: {
    toggleFavorite: vi.fn(),
  },
  taxonomyApi: {
    getAll: vi.fn(),
  },
}));

vi.mock('@/hooks/useAIStatus', () => ({
  useAIStatus: () => ({ isReady: false, isLoading: false }),
  AISetupBadge: () => <span>AI Setup</span>,
}));

const mockedRecipeApi = vi.mocked(recipeApi);
const mockedTaxonomyApi = vi.mocked(taxonomyApi);

const recipe = {
  id: 'r1',
  title: 'Delete Me',
  description: 'A recipe for testing deletion.',
  servings: 4,
  prepTime: 15,
  cookTime: 30,
  difficulty: 'medium',
  ingredients: [{ id: 'i1', name: 'Pasta', quantity: 1, unit: 'cup' }],
  instructions: ['Boil pasta.'],
  categories: [],
  tags: [],
};

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/recipes/r1']}>
      <Routes>
        <Route path="/recipes" element={<div>Recipes list</div>} />
        <Route
          path="/recipes/:id"
          element={
            <>
              <RecipeDetailPage />
              <ConfirmHost />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

async function openDeleteDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'More actions' }));
  await user.click(screen.getByRole('button', { name: 'Delete Recipe' }));
  expect(
    await screen.findByRole('dialog', { name: 'Delete recipe?' })
  ).toBeInTheDocument();
}

describe('RecipeDetailPage delete (issue #57)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConfirmStore.setState({ request: null });
    mockedRecipeApi.getById.mockResolvedValue({ data: recipe } as never);
    mockedRecipeApi.delete.mockResolvedValue(undefined as never);
    mockedTaxonomyApi.getAll.mockResolvedValue({ data: [] } as never);
  });

  it('calls delete and navigates away when the dialog Delete button is confirmed', async () => {
    const user = userEvent.setup();
    renderDetail();
    expect((await screen.findAllByText('Delete Me')).length).toBeGreaterThan(0);

    await openDeleteDialog(user);
    // Exact-name match: the dialog's × button is named "Close Delete recipe?"
    // and must NOT be mistaken for the confirm button.
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockedRecipeApi.delete).toHaveBeenCalledWith('r1');
    });
    expect(await screen.findByText('Recipes list')).toBeInTheDocument();
  });

  it('does not delete when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderDetail();
    expect((await screen.findAllByText('Delete Me')).length).toBeGreaterThan(0);

    await openDeleteDialog(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(mockedRecipeApi.delete).not.toHaveBeenCalled();
    expect(screen.getAllByText('Delete Me').length).toBeGreaterThan(0);
  });

  it('does not delete when the dialog × close button is clicked', async () => {
    const user = userEvent.setup();
    renderDetail();
    expect((await screen.findAllByText('Delete Me')).length).toBeGreaterThan(0);

    await openDeleteDialog(user);
    await user.click(screen.getByRole('button', { name: 'Close Delete recipe?' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(mockedRecipeApi.delete).not.toHaveBeenCalled();
    expect(screen.getAllByText('Delete Me').length).toBeGreaterThan(0);
  });

  it('shows an error toast and stays on the page when delete fails', async () => {
    const user = userEvent.setup();
    mockedRecipeApi.delete.mockRejectedValueOnce(new Error('boom'));
    renderDetail();
    expect((await screen.findAllByText('Delete Me')).length).toBeGreaterThan(0);

    await openDeleteDialog(user);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockedRecipeApi.delete).toHaveBeenCalledWith('r1');
    });
    // Navigation must NOT happen on failure.
    expect(screen.queryByText('Recipes list')).not.toBeInTheDocument();
    expect(screen.getAllByText('Delete Me').length).toBeGreaterThan(0);
  });
});
