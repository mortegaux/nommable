import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DashboardLayout from '@/features/layout/DashboardLayout';
import App from '@/App';

// FeedbackWidget fetches on mount — unrelated to this PR, mock it out.
vi.mock('@/components/FeedbackWidget', () => ({
  FeedbackWidget: () => null,
}));

vi.mock('@/components/ToastHost', () => ({ ToastHost: () => null }));
vi.mock('@/components/ConfirmHost', () => ({ ConfirmHost: () => null }));

vi.mock('@/hooks/useAIStatus', () => ({
  useAIStatus: () => ({ isReady: false, isLoading: false }),
  AISetupBadge: () => null,
}));

vi.mock('@/services/api', () => ({
  mealPlanApi: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
  pantryApi: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
  batchCookingApi: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
  shoppingListApi: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
  recipeApi: { getById: vi.fn(), create: vi.fn(), update: vi.fn(), uploadImage: vi.fn() },
  taxonomyApi: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
  authApi: { me: vi.fn() },
  settingsApi: { getSystemStatus: vi.fn() },
}));

// Auth + branding stores: App reads them on mount (checkAuth, loadBranding).
// Mock them as real zustand stores so selector calls keep working.
vi.mock('@/store/auth.store', async () => {
  const { create } = await import('zustand');
  const useAuthStore = create(() => ({
    user: {
      id: 'u1',
      email: 'a@example.com',
      username: 'auditadmin',
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    token: 't',
    isLoading: false,
    needsSetup: false,
    authError: null,
    checkAuth: vi.fn(),
  }));
  return { useAuthStore };
});

vi.mock('@/store/branding.store', async () => {
  const { create } = await import('zustand');
  const useBrandingStore = create(() => ({
    branding: null,
    loadBranding: vi.fn(),
  }));
  return { useBrandingStore };
});

function renderLayout(initialEntry = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route path="dashboard" element={<div>Dashboard page</div>} />
          <Route path="recipes" element={<div>Recipes page</div>} />
          <Route path="collections" element={<div>Collections page</div>} />
          <Route path="meal-plans" element={<div>Meal Plans page</div>} />
          <Route path="batch-cooking" element={<div>Batch Cooking page</div>} />
          <Route path="shopping-lists" element={<div>Shopping Lists page</div>} />
          <Route path="pantry" element={<div>Pantry page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('Nav restructure: Dashboard rename + nested nav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows 5 top-level nav items; children stay hidden until the dropdown opens', () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'Dashboard',
      'Recipes',
      'Meal Plans',
      'Shopping Lists',
      'Pantry',
    ]);
    expect(screen.queryByRole('link', { name: 'Collections' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Batch Cooking' })).toBeNull();
  });

  it('opens the Recipes submenu to reveal Collections', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Show Recipes submenu' }));
    const menu = screen.getByRole('menu', { name: 'Recipes submenu' });
    expect(within(menu).getByRole('menuitem', { name: 'Collections' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Batch Cooking' })).toBeNull();
  });

  it('opens the Meal Plans submenu to reveal Batch Cooking', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Show Meal Plans submenu' }));
    const menu = screen.getByRole('menu', { name: 'Meal Plans submenu' });
    expect(within(menu).getByRole('menuitem', { name: 'Batch Cooking' })).toBeInTheDocument();
  });

  it('closes the dropdown on Escape and returns focus to the chevron', () => {
    renderLayout();
    const chevron = screen.getByRole('button', { name: 'Show Recipes submenu' });
    fireEvent.click(chevron);
    const menu = screen.getByRole('menu', { name: 'Recipes submenu' });
    // Dispatch on the menu element (not document): the global "n" shortcut
    // handler in NewRecipeMenu calls e.target.closest, which document lacks.
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(chevron);
  });

  it('closes the dropdown on outside click', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Show Recipes submenu' }));
    expect(screen.getByRole('menu', { name: 'Recipes submenu' })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the dropdown on navigation', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Show Recipes submenu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Collections' }));
    expect(screen.getByText('Collections page')).toBeInTheDocument();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('marks the parent active when on a child route', () => {
    renderLayout('/collections');
    const recipesLink = screen.getByRole('link', { name: 'Recipes' });
    expect(recipesLink.className).toContain('font-semibold');
    expect(recipesLink.className).toContain('text-primary');
  });

  it('parent link still navigates to the parent page', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('link', { name: 'Recipes' }));
    expect(screen.getByText('Recipes page')).toBeInTheDocument();
  });

  it('mobile drawer groups children indented under their parents', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation menu' }));
    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    // 5 parents + 2 children
    expect(mobileNav.querySelectorAll('a')).toHaveLength(7);
    expect(within(mobileNav).getByRole('link', { name: 'Collections' }).className).toContain('pl-6');
    expect(within(mobileNav).getByRole('link', { name: 'Batch Cooking' }).className).toContain('pl-6');
  });

  it('logo links to /dashboard', () => {
    renderLayout();
    expect(screen.getByRole('link', { name: 'Nommable home' }).getAttribute('href')).toBe('/dashboard');
  });

  it('redirects the old /kitchen-today URL to /dashboard (real App routes)', async () => {
    window.history.pushState({}, '', '/kitchen-today');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
  });
});
