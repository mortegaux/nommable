import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DashboardLayout from '@/features/layout/DashboardLayout';
import { UserDropdown } from '@/components/UserDropdown';
import { CookingMode } from '@/features/recipes/CookingMode';
import RecipeForm from '@/features/recipes/RecipeForm';
import { useAuthStore } from '@/store/auth.store';
import { UserRole, type User } from '@nommable/shared';

// FeedbackWidget fetches on mount — unrelated to this PR, mock it out.
vi.mock('@/components/FeedbackWidget', () => ({
  FeedbackWidget: () => null,
}));

vi.mock('@/hooks/useAIStatus', () => ({
  useAIStatus: () => ({ isReady: false, isLoading: false }),
  AISetupBadge: () => null,
}));

vi.mock('@/services/api', () => ({
  taxonomyApi: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
  recipeApi: { getById: vi.fn(), create: vi.fn(), update: vi.fn(), uploadImage: vi.fn() },
}));

const testUser: User = {
  id: 'u1',
  email: 'a@example.com',
  username: 'auditadmin',
  role: UserRole.ADMIN,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/recipes']}>
      <Routes>
        <Route path="/recipes" element={<DashboardLayout />} />
        <Route path="/pantry" element={<DashboardLayout />} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Mobile responsiveness (issue #5)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: testUser, token: 't', isLoading: false });
  });

  it('shows the desktop sidebar only at lg and up', () => {
    renderLayout();
    const sidebar = screen.getByRole('complementary', { name: 'Main sidebar' });
    expect(sidebar.className).toContain('hidden');
    expect(sidebar.className).toContain('lg:flex');
    expect(sidebar.className).not.toContain('md:flex');
  });

  it('shows the bottom tab bar only below lg, with no hamburger menu', () => {
    renderLayout();
    const tabbar = screen.getByRole('navigation', { name: 'Bottom navigation' });
    expect(tabbar.className).toContain('lg:hidden');
    expect(tabbar.className).not.toContain('md:hidden');
    expect(tabbar.className).toContain('fixed');
    expect(screen.queryByRole('button', { name: 'Toggle navigation menu' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).toBeNull();
    // Tabs navigate directly — no drawer in between.
    fireEvent.click(within(tabbar).getByRole('link', { name: 'Pantry' }));
    expect(screen.getByRole('navigation', { name: 'Bottom navigation' })).toBeInTheDocument();
  });

  it('hides the username text below xl (avatar-only user menu on tablets)', () => {
    render(<MemoryRouter><UserDropdown /></MemoryRouter>);
    const name = screen.getByText('auditadmin');
    expect(name.className).toContain('hidden');
    expect(name.className).toContain('xl:inline');
    expect(name.className).not.toContain('sm:inline');
  });

  it('cooking mode step header wraps instead of crowding on narrow screens', () => {
    const recipe = {
      id: 'r1',
      title: 'Test Soup',
      instructions: ['Mix well.', 'Serve.'],
    };
    const { container } = render(
      <CookingMode recipe={recipe as never} servingMultiplier={1} onExit={() => {}} />
    );
    const heading = screen.getByRole('heading', { name: 'Step 1' });
    expect(heading.className).toContain('whitespace-nowrap');
    const headerRow = heading.closest('div.flex-wrap');
    expect(headerRow?.className).toContain('flex-wrap');
    // Card padding is tighter on mobile, roomy at sm+
    expect(container.querySelector('.bg-card.rounded-2xl')?.className).toContain('p-5');
    expect(container.querySelector('.bg-card.rounded-2xl')?.className).toContain('sm:p-8');
  });

  it('recipe form tab bar scrolls horizontally so every tab stays reachable on phones', () => {
    render(
      <MemoryRouter>
        <RecipeForm />
      </MemoryRouter>
    );
    const basicsTab = screen.getByRole('button', { name: /basics/i });
    const tabStrip = basicsTab.closest('div.flex');
    expect(tabStrip?.className).toContain('min-w-max');
    expect(tabStrip?.parentElement?.className).toContain('overflow-x-auto');
  });
});
