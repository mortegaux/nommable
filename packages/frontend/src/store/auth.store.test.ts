import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '@/store/auth.store';
import type { User } from '@nommable/shared';
import { UserRole } from '@nommable/shared';

const mockMe = vi.fn();
const mockGetStatus = vi.fn();

vi.mock('@/services/api', () => ({
  authApi: {
    me: (...args: unknown[]) => mockMe(...args),
    login: vi.fn(),
    logout: vi.fn(),
    registerWithInvite: vi.fn(),
  },
  setupApi: {
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
  },
}));

const mockUser: User = {
  id: 'u1',
  email: 'admin@example.com',
  username: 'admin',
  role: UserRole.ADMIN,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function errorWithStatus(status: number): Error {
  const error = new Error(`Request failed with status code ${status}`) as Error & {
    response: { status: number };
  };
  error.response = { status };
  return error;
}

describe('auth.store checkAuth (issue #70)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    useAuthStore.setState({
      user: null,
      token: 'test-token',
      isLoading: true,
      needsSetup: false,
      authError: null,
    });
    mockGetStatus.mockResolvedValue({ data: { needsSetup: false } });
  });

  it('clears the token on 401 (genuinely invalid session)', async () => {
    mockMe.mockRejectedValue(errorWithStatus(401));

    await useAuthStore.getState().checkAuth();

    expect(localStorage.getItem('token')).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().authError).toBeNull();
    expect(mockMe).toHaveBeenCalledTimes(1);
  });

  it('keeps the token and flags transient on 429', async () => {
    mockMe.mockRejectedValue(errorWithStatus(429));

    await useAuthStore.getState().checkAuth();

    expect(localStorage.getItem('token')).toBe('test-token');
    expect(useAuthStore.getState().token).toBe('test-token');
    expect(useAuthStore.getState().authError).toBe('transient');
    // First attempt + one retry.
    expect(mockMe).toHaveBeenCalledTimes(2);
  });

  it('keeps the token and flags transient on 500', async () => {
    mockMe.mockRejectedValue(errorWithStatus(500));

    await useAuthStore.getState().checkAuth();

    expect(localStorage.getItem('token')).toBe('test-token');
    expect(useAuthStore.getState().token).toBe('test-token');
    expect(useAuthStore.getState().authError).toBe('transient');
    expect(mockMe).toHaveBeenCalledTimes(2);
  });

  it('keeps the token and flags transient on network failure', async () => {
    mockMe.mockRejectedValue(new Error('network down'));

    await useAuthStore.getState().checkAuth();

    expect(localStorage.getItem('token')).toBe('test-token');
    expect(useAuthStore.getState().token).toBe('test-token');
    expect(useAuthStore.getState().authError).toBe('transient');
    expect(mockMe).toHaveBeenCalledTimes(2);
  });

  it('retries once after a transient failure and recovers', async () => {
    mockMe
      .mockRejectedValueOnce(errorWithStatus(429))
      .mockResolvedValueOnce({ data: mockUser });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().user).toEqual(mockUser);
    expect(useAuthStore.getState().token).toBe('test-token');
    expect(localStorage.getItem('token')).toBe('test-token');
    expect(useAuthStore.getState().authError).toBeNull();
    expect(mockMe).toHaveBeenCalledTimes(2);
  });

  it('clears the token when the retry comes back 401', async () => {
    mockMe
      .mockRejectedValueOnce(errorWithStatus(429))
      .mockRejectedValueOnce(errorWithStatus(401));

    await useAuthStore.getState().checkAuth();

    expect(localStorage.getItem('token')).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().authError).toBeNull();
    expect(mockMe).toHaveBeenCalledTimes(2);
  });
});
