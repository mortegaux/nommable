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

describe('App shell: sidebar + bottom tab bar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders all 7 sidebar destinations with Dashboard first', () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'Dashboard',
      'Recipes',
      'Collections',
      'Meal Plans',
      'Batch Cooking',
      'Shopping Lists',
      'Pantry',
    ]);
  });

  it('groups sidebar destinations under Kitchen and Household section labels', () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByText('Kitchen')).toBeInTheDocument();
    expect(within(nav).getByText('Household')).toBeInTheDocument();
  });

  it('marks the active sidebar row with a filled row and primary text', () => {
    renderLayout('/collections');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const link = within(nav).getByRole('link', { name: 'Collections' });
    expect(link.className).toContain('bg-muted');
    expect(link.className).toContain('font-semibold');
    expect(link.className).toContain('text-primary');
    expect(link.getAttribute('aria-current')).toBe('page');
  });

  it('collapse toggle switches the sidebar to icon-rail mode and persists', () => {
    renderLayout();
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    const sidebar = screen.getByRole('complementary', { name: 'Main sidebar' });
    expect(sidebar.className).toContain('w-60');
    fireEvent.click(toggle);
    expect(sidebar.className).toContain('w-16');
    expect(sidebar.className).not.toContain('w-60');
    // Labels hidden, icons remain; section labels become plain dividers.
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).queryByText('Recipes')).toBeNull();
    expect(within(nav).queryByText('Kitchen')).toBeNull();
    expect(within(nav).getAllByRole('link')).toHaveLength(7);
    expect(localStorage.getItem('nommable:sidebar-collapsed')).toBe('1');
    // Icons carry the label as a tooltip for accessibility.
    const iconLink = within(nav).getAllByRole('link')[1];
    expect(iconLink.getAttribute('title')).toBe('Recipes');
    // Rail mode: the user chip collapses to the avatar, username as tooltip.
    const userButtons = screen.getAllByRole('button', { name: 'User menu' });
    expect(userButtons.some((b) => b.getAttribute('title') === 'auditadmin')).toBe(true);
  });

  it('restores the collapsed sidebar from localStorage', () => {
    localStorage.setItem('nommable:sidebar-collapsed', '1');
    renderLayout();
    const sidebar = screen.getByRole('complementary', { name: 'Main sidebar' });
    expect(sidebar.className).toContain('w-16');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('renders exactly 5 bottom tabs with icons and short labels', () => {
    renderLayout();
    const tabbar = screen.getByRole('navigation', { name: 'Bottom navigation' });
    const tabs = within(tabbar).getAllByRole('link');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Dashboard',
      'Recipes',
      'Plans',
      'Lists',
      'Pantry',
    ]);
    for (const tab of tabs) {
      expect(tab.querySelector('svg')).not.toBeNull();
    }
  });

  it('marks the active tab with the pill indicator and primary label', () => {
    renderLayout('/pantry');
    const tabbar = screen.getByRole('navigation', { name: 'Bottom navigation' });
    const tab = within(tabbar).getByRole('link', { name: 'Pantry' });
    expect(tab.getAttribute('aria-current')).toBe('page');
    // Material-style pill behind the active icon.
    const pill = tab.querySelector('span');
    expect(pill?.className).toContain('bg-primary/10');
    // Inactive tabs have no pill.
    const inactive = within(tabbar).getByRole('link', { name: 'Dashboard' });
    expect(inactive.querySelector('span')?.className).not.toContain('bg-primary/10');
  });

  it('navigates when a sidebar link is clicked', () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    fireEvent.click(within(nav).getByRole('link', { name: 'Collections' }));
    expect(screen.getByText('Collections page')).toBeInTheDocument();
  });

  it('has no hamburger menu or mobile drawer', () => {
    renderLayout();
    expect(screen.queryByRole('button', { name: 'Toggle navigation menu' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).toBeNull();
  });

  it('both logo links point to /dashboard', () => {
    renderLayout();
    const logos = screen.getAllByRole('link', { name: 'Nommable home' });
    expect(logos.length).toBeGreaterThanOrEqual(1);
    for (const logo of logos) {
      expect(logo.getAttribute('href')).toBe('/dashboard');
    }
  });

  it('redirects the old /kitchen-today URL to /dashboard (real App routes)', async () => {
    window.history.pushState({}, '', '/kitchen-today');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
  });
});
