import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserDropdown } from '@/components/UserDropdown';

const { setTheme } = vi.hoisted(() => ({ setTheme: vi.fn() }));

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
    logout: vi.fn(),
  }));
  return { useAuthStore };
});

vi.mock('@/store/theme.store', async () => {
  const { create } = await import('zustand');
  const useThemeStore = create(() => ({
    theme: 'system',
    setTheme,
  }));
  return { useThemeStore };
});

function renderDropdown(variant?: 'header' | 'footer', iconOnly?: boolean) {
  return render(
    <MemoryRouter>
      <UserDropdown variant={variant} iconOnly={iconOnly} />
    </MemoryRouter>
  );
}

describe('UserDropdown variants (#94)', () => {
  it('footer variant: panel opens upward left-aligned so it stays on-canvas', () => {
    renderDropdown('footer');
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    const menu = screen.getByRole('menu');
    expect(menu.className).toContain('bottom-full');
    expect(menu.className).toContain('left-0');
    expect(menu.className).not.toContain('right-0');
  });

  it('footer variant: username sits next to the avatar', () => {
    renderDropdown('footer');
    // username appears in the trigger (and again in the menu once opened)
    expect(screen.getByText('auditadmin')).toBeTruthy();
  });

  it('footer iconOnly: bare circular avatar (no chip that can clip in the rail)', () => {
    renderDropdown('footer', true);
    const trigger = screen.getByRole('button', { name: 'User menu' });
    expect(trigger.getAttribute('title')).toBe('auditadmin');
    expect(screen.queryByText('auditadmin')).toBeNull();
    expect(trigger.className).toContain('rounded-full');
    expect(trigger.className).not.toContain('border');
    expect(trigger.className).not.toContain('bg-card');
  });

  it('header variant: panel opens downward right-aligned', () => {
    renderDropdown('header');
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    const menu = screen.getByRole('menu');
    expect(menu.className).toContain('right-0');
    expect(menu.className).not.toContain('bottom-full');
  });

  it('theme is selectable from inside the menu (Light/Dark/System)', () => {
    renderDropdown('footer');
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    expect(screen.getByRole('radio', { name: /System/ }).getAttribute('aria-checked')).toBe(
      'true'
    );
    fireEvent.click(screen.getByRole('radio', { name: /Dark/ }));
    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});
