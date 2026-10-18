import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { User } from '@nommable/shared';
import { UserRole } from '@nommable/shared';
import { UpdateBanner, dismissForVersion } from './UpdateBanner';
import { FeedbackWidget } from './FeedbackWidget';
import { useAuthStore } from '@/store/auth.store';

const mockNavigate = vi.fn();
const mockApiGet = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/services/api', () => ({
  default: { get: (...args: unknown[]) => mockApiGet(...args) },
  authApi: {},
  setupApi: {},
  feedbackApi: { submit: vi.fn() },
  settingsApi: { getGeneralSettings: vi.fn().mockResolvedValue({ data: {} }) },
}));

const adminUser: User = {
  id: 'u1',
  email: 'admin@example.com',
  username: 'admin',
  role: UserRole.ADMIN,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const regularUser: User = { ...adminUser, id: 'u2', username: 'regular', role: UserRole.USER };

function systemResponse(updateAvailable: boolean, version: string | null) {
  return {
    data: {
      installedVersion: '1.2.0',
      available: { status: updateAvailable ? 'update-available' : 'up-to-date', version, updateAvailable },
    },
  };
}

function renderBanner() {
  return render(
    <MemoryRouter>
      <UpdateBanner />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useAuthStore.setState({ user: adminUser });
});

describe('UpdateBanner (issue #52)', () => {
  it('shows the banner when an update is available', async () => {
    mockApiGet.mockResolvedValue(systemResponse(true, 'v1.3.0'));
    renderBanner();
    expect(await screen.findByRole('button', { name: /Update available: version v1\.3\.0/i })).toBeInTheDocument();
  });

  it('hides the banner when up to date', async () => {
    mockApiGet.mockResolvedValue(systemResponse(false, 'v1.2.0'));
    renderBanner();
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByRole('button', { name: /Update available/i })).not.toBeInTheDocument();
  });

  it('hides the banner when the update check fails or reports no version', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('offline'));
    const { unmount } = renderBanner();
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByRole('button', { name: /Update available/i })).not.toBeInTheDocument();
    unmount();

    mockApiGet.mockResolvedValueOnce(systemResponse(true, null));
    renderBanner();
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByRole('button', { name: /Update available/i })).not.toBeInTheDocument();
  });

  it('never renders — and never fetches — for non-admins', async () => {
    useAuthStore.setState({ user: regularUser });
    mockApiGet.mockResolvedValue(systemResponse(true, 'v1.3.0'));
    renderBanner();
    // Give any stray fetch a chance to fire, then assert it never did.
    await new Promise((r) => setTimeout(r, 50));
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Update available/i })).not.toBeInTheDocument();
  });

  it('clicking the banner navigates to Settings → System tab', async () => {
    mockApiGet.mockResolvedValue(systemResponse(true, 'v1.3.0'));
    const user = userEvent.setup();
    renderBanner();
    await user.click(await screen.findByRole('button', { name: /Update available: version v1\.3\.0/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/settings?tab=system');
  });

  it('dismiss hides the banner for that version, but it reappears for a newer version', async () => {
    mockApiGet.mockResolvedValue(systemResponse(true, 'v1.3.0'));
    const user = userEvent.setup();
    const { unmount } = renderBanner();
    const banner = await screen.findByRole('button', { name: /Update available: version v1\.3\.0/i });
    await user.click(screen.getByRole('button', { name: /Dismiss update notification/i }));
    expect(banner).not.toBeInTheDocument();
    expect(localStorage.getItem('nommable:update-banner-dismissed:v1.3.0')).toBe('1');
    unmount();

    // Same version → stays hidden across remounts.
    const { unmount: unmountRemount } = renderBanner();
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByRole('button', { name: /Update available/i })).not.toBeInTheDocument();
    unmountRemount();

    // Newer version → reappears (dismissal is keyed per available version).
    mockApiGet.mockResolvedValue(systemResponse(true, 'v1.4.0'));
    const { unmount: unmount2 } = renderBanner();
    expect(await screen.findByRole('button', { name: /Update available: version v1\.4\.0/i })).toBeInTheDocument();
    unmount2();
  });

  it('respects a dismissal stored before mount', async () => {
    dismissForVersion('v1.3.0');
    mockApiGet.mockResolvedValue(systemResponse(true, 'v1.3.0'));
    renderBanner();
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByRole('button', { name: /Update available/i })).not.toBeInTheDocument();
  });

  it('fetches the version check exactly once per mount (no polling loop)', async () => {
    mockApiGet.mockResolvedValue(systemResponse(true, 'v1.3.0'));
    renderBanner();
    await screen.findByRole('button', { name: /Update available/i });
    await new Promise((r) => setTimeout(r, 100));
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it('positions the banner left of the feedback button and keeps the button clickable', async () => {
    mockApiGet.mockResolvedValue(systemResponse(true, 'v1.3.0'));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <FeedbackWidget />
      </MemoryRouter>,
    );
    const banner = await screen.findByRole('button', { name: /Update available: version v1\.3\.0/i });
    // Non-overlapping fixed offsets: the feedback button spans 16–56px from
    // the right edge (right-4, w-10); the banner's right edge sits at 72px
    // (right-[4.5rem]), leaving a 16px gap. jsdom cannot do real layout, so
    // the contract is asserted on the positioning classes + DOM separation.
    expect(banner.parentElement).toHaveClass('right-[4.5rem]');
    expect(banner.parentElement).toHaveClass('bottom-4');
    const feedbackButton = screen.getByRole('button', {
      name: /Report a bug or request a feature/i,
    });
    expect(feedbackButton).toHaveClass('right-4');
    expect(feedbackButton).not.toContainElement(banner);
    // The feedback button is still fully clickable with the banner present.
    await user.click(feedbackButton);
    expect(await screen.findByText(/Report a bug \/ Request a feature/i)).toBeInTheDocument();
  });
});
