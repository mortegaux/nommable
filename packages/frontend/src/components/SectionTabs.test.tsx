import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SectionTabs } from './SectionTabs';

const recipesTabs = [
  { path: '/recipes', label: 'All Recipes' },
  { path: '/collections', label: 'Collections' },
];

function renderTabs(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SectionTabs tabs={recipesTabs} label="Recipes sections" />
    </MemoryRouter>
  );
}

describe('SectionTabs', () => {
  it('renders both sibling sections and marks the current one active', () => {
    renderTabs('/collections');
    const nav = screen.getByRole('navigation', { name: 'Recipes sections' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['All Recipes', 'Collections']);
    const active = within(nav).getByRole('link', { name: 'Collections' });
    expect(active.getAttribute('aria-current')).toBe('page');
    expect(active.className).toContain('font-semibold');
    expect(active.className).toContain('text-primary');
  });

  it('is mobile-only (hidden at lg where the sidebar lists sections)', () => {
    renderTabs('/recipes');
    const nav = screen.getByRole('navigation', { name: 'Recipes sections' });
    expect(nav.className).toContain('lg:hidden');
  });
});
