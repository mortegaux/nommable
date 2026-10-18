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
        <Route path="/kitchen-today" element={<div>Kitchen Today</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Mobile responsiveness (issue #5)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: testUser, token: 't', isLoading: false });
  });

  it('shows the desktop nav only at lg and up (7 links fit at 1024, not at 768)', () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav.className).toContain('hidden');
    expect(nav.className).toContain('lg:flex');
    expect(nav.className).not.toContain('md:flex');
    expect(nav.className).toContain('lg:space-x-2');
    expect(nav.className).toContain('xl:space-x-6');
  });

  it('shows the hamburger only below lg, and the mobile menu closes on navigation', () => {
    renderLayout();
    const toggle = screen.getByRole('button', { name: 'Toggle navigation menu' });
    expect(toggle.className).toContain('lg:hidden');
    expect(toggle.className).not.toContain('md:hidden');
    fireEvent.click(toggle);
    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    expect(mobileNav.className).toContain('lg:hidden');
    expect(mobileNav.className).not.toContain('md:hidden');
    // 7 links including Kitchen Today (remote main added it after the #13 base)
    expect(mobileNav.querySelectorAll('a')).toHaveLength(7);
    // Desktop nav (hidden below lg) also has a Kitchen Today link — scope to the mobile menu
    fireEvent.click(within(mobileNav).getByRole('link', { name: 'Kitchen Today' }));
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).toBeNull();
    expect(screen.getByText('Kitchen Today')).toBeInTheDocument();
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
