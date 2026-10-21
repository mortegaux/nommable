import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { aiApi } from '@/services/api';
import UserAIKeySettings from './UserAIKeySettings';

vi.mock('@/services/api', () => ({
  aiApi: {
    getMyConfig: vi.fn(),
    saveMyConfig: vi.fn(),
    deleteMyConfig: vi.fn(),
    testMyConfig: vi.fn(),
  },
}));

vi.mock('@/hooks/useAIStatus', () => ({
  invalidateAIStatus: vi.fn(),
}));

const mockedGetMyConfig = aiApi.getMyConfig as unknown as ReturnType<typeof vi.fn>;

function mockMode(mode: 'shared' | 'per-user' | 'managed') {
  mockedGetMyConfig.mockResolvedValue({
    data: {
      mode,
      provider: null,
      enabled: true,
      hasApiKey: false,
      maskedKey: null,
      baseUrl: null,
    },
  });
}

describe('UserAIKeySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shared mode: shows the instance-key info card and no form', async () => {
    mockMode('shared');
    render(<UserAIKeySettings />);
    await waitFor(() => {
      expect(screen.getByText('Using the instance shared key')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Save key' })).not.toBeInTheDocument();
  });

  it('managed mode: shows the key form with managed copy (BYOK escape hatch)', async () => {
    mockMode('managed');
    render(<UserAIKeySettings />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save key' })).toBeInTheDocument();
    });
    expect(screen.getByText(/Managed AI — the operator's key powers AI features/)).toBeInTheDocument();
    expect(screen.queryByText('Using the instance shared key')).not.toBeInTheDocument();
  });

  it('per-user mode: shows the key form with per-user copy', async () => {
    mockMode('per-user');
    render(<UserAIKeySettings />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save key' })).toBeInTheDocument();
    });
    expect(screen.getByText(/This instance uses per-user AI keys/)).toBeInTheDocument();
  });
});
