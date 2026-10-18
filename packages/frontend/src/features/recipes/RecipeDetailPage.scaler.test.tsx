import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RecipeDetailPage from './RecipeDetailPage';
import { recipeApi, taxonomyApi } from '@/services/api';

vi.mock('@/services/api', () => ({
  recipeApi: {
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    uploadImage: vi.fn(),
  },
  ratingApi: { rate: vi.fn(), unrate: vi.fn() },
  collectionApi: { toggleFavorite: vi.fn() },
  taxonomyApi: { getAll: vi.fn() },
}));

vi.mock('@/hooks/useAIStatus', () => ({
  useAIStatus: () => ({ isReady: false, isLoading: false }),
  AISetupBadge: () => null,
}));

const fixtureRecipe = {
  id: 'r1',
  title: 'Test Soup',
  description: 'A test recipe',
  servings: 4,
  prepTime: 10,
  cookTime: 20,
  difficulty: 'easy',
  ingredients: [{ id: 'i1', name: 'Flour', quantity: 2, unit: 'cups', notes: '' }],
  instructions: ['Mix well.'],
  categories: [],
  tags: [],
  imageUrl: null,
  sourceUrl: null,
  notes: null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/recipes/r1']}>
      <Routes>
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RecipeDetailPage scaler placement (issue #13)', () => {
  beforeEach(() => {
    vi.mocked(recipeApi.getById).mockResolvedValue({ data: fixtureRecipe } as never);
    vi.mocked(taxonomyApi.getAll).mockResolvedValue({ data: [] } as never);
  });

  it('renders the scaler inside the ingredients section, below its heading', async () => {
    const { container } = renderPage();
    // The title renders twice: once in the print-only header, once in the
    // visible title block. Either proves the page loaded.
    await waitFor(() => expect(screen.getAllByText('Test Soup').length).toBeGreaterThan(0));

    const ingredientsCard = container.querySelector('.recipe-ingredients');
    expect(ingredientsCard).not.toBeNull();
    const scaler = screen.getByLabelText('Adjust servings');
    expect(ingredientsCard).toContainElement(scaler);

    // The scaler follows the heading in document order — it is a block
    // below the heading, not a sidecar wedged beside it.
    const heading = screen.getByRole('heading', { name: 'Ingredients' });
    expect(
      Boolean(heading.compareDocumentPosition(scaler) & Node.DOCUMENT_POSITION_FOLLOWING)
    ).toBe(true);
  });

  it('still scales ingredient quantities when the scaler changes', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Test Soup').length).toBeGreaterThan(0));

    const item = screen.getByText('Flour').closest('li');
    expect(item?.textContent).toContain('2');

    fireEvent.change(screen.getByLabelText('Adjust servings'), { target: { value: '2' } });
    await waitFor(() => expect(screen.getByText(/Adjusted for/)).toHaveTextContent('8'));
    expect(item?.textContent).toContain('4');
  });

  it('gives Cook the primary button treatment (PageHeader contract)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Test Soup').length).toBeGreaterThan(0));
    const cook = screen.getByRole('button', { name: 'Enter cooking mode' });
    expect(cook.className).toContain('bg-primary');
    expect(cook.className).toContain('text-primary-foreground');
  });
});
