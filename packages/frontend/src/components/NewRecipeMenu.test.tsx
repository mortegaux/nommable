import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NewRecipeMenu } from '@/components/NewRecipeMenu';

vi.mock('@/hooks/useAIStatus', () => ({
  useAIStatus: () => ({ isReady: false, isLoading: false }),
  AISetupBadge: () => null,
}));

function renderMenu(variant?: 'button' | 'nav', iconOnly?: boolean) {
  return render(
    <MemoryRouter>
      <NewRecipeMenu variant={variant} iconOnly={iconOnly} />
    </MemoryRouter>
  );
}

describe('NewRecipeMenu variants (#92)', () => {
  it('nav variant: trigger blends with the nav — orange text, no filled button container', () => {
    renderMenu('nav');
    const trigger = screen.getByRole('button', { name: 'Add a new recipe' });
    expect(trigger.className).toContain('text-primary');
    expect(trigger.className).toContain('hover:bg-primary/10');
    // no filled button container (bg-primary fill only appears as the hover tint)
    expect(trigger.className).not.toContain('bg-primary ');
  });

  it('nav variant: menu panel opens left-aligned so it stays on-canvas in the sidebar', () => {
    renderMenu('nav');
    fireEvent.click(screen.getByRole('button', { name: 'Add a new recipe' }));
    const menu = screen.getByRole('menu', { name: 'Add a new recipe' });
    expect(menu.className).toContain('left-0');
    expect(menu.className).not.toContain('right-0');
    expect(screen.getByRole('menuitem', { name: /Create manually/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Import from URL/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Generate with AI/ })).toBeTruthy();
  });

  it('nav variant with iconOnly: hides the New label (rail mode)', () => {
    renderMenu('nav', true);
    expect(screen.queryByText('New')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add a new recipe' }));
    expect(screen.getByRole('menu').className).toContain('left-0');
  });

  it('button variant: menu panel opens right-aligned (mobile header)', () => {
    renderMenu('button');
    const trigger = screen.getByRole('button', { name: 'Add a new recipe' });
    expect(trigger.className).toContain('bg-primary');
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Add a new recipe' });
    expect(menu.className).toContain('right-0');
    expect(menu.className).not.toContain('left-0');
  });
});
