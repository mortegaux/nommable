import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BrandingSettingsPage from '@/features/settings/BrandingSettingsPage';
import { useAuthStore } from '@/store/auth.store';
import { useBrandingStore } from '@/store/branding.store';
import { UserRole, type User } from '@nommable/shared';

const adminUser: User = {
  id: 'u1',
  email: 'admin@example.com',
  username: 'admin',
  role: UserRole.ADMIN,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const plainUser: User = { ...adminUser, id: 'u2', username: 'cook', role: UserRole.USER };

describe('BrandingSettingsPage', () => {
  beforeEach(() => {
    useBrandingStore.setState({
      branding: { appName: null, logoUrl: null, accentColor: null, faviconUrl: null },
      loaded: true,
    });
  });

  it('renders the branding form for admins', () => {
    useAuthStore.setState({ user: adminUser } as never);
    render(
      <MemoryRouter>
        <BrandingSettingsPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Branding')).toBeTruthy();
    expect(screen.getByLabelText('App name')).toBeTruthy();
    expect(screen.getByLabelText('Custom hex')).toBeTruthy();
    expect(screen.getByText('Save name & accent')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeTruthy();
  });

  it('refuses non-admins', () => {
    useAuthStore.setState({ user: plainUser } as never);
    render(
      <MemoryRouter>
        <BrandingSettingsPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Only admins can change instance branding.')).toBeTruthy();
    expect(screen.queryByText('Save name & accent')).toBeNull();
  });

  it('shows the current custom logo state', () => {
    useAuthStore.setState({ user: adminUser } as never);
    useBrandingStore.setState({
      branding: {
        appName: 'My Kitchen',
        logoUrl: '/uploads/branding/logo-1.png',
        accentColor: '#C2410C',
        faviconUrl: null,
      },
      loaded: true,
    });
    render(
      <MemoryRouter>
        <BrandingSettingsPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Custom logo in use.')).toBeTruthy();
    expect(screen.getByText('Remove custom logo')).toBeTruthy();
  });
});
