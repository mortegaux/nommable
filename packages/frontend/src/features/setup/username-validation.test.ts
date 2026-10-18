import { describe, it, expect } from 'vitest';
import { validateSetupUsername } from './username-validation';

describe('validateSetupUsername (mirrors Better Auth username() defaults)', () => {
  it('accepts plain alphanumeric usernames', () => {
    expect(validateSetupUsername('admin')).toBeNull();
    expect(validateSetupUsername('qaadmin')).toBeNull();
    expect(validateSetupUsername('user123')).toBeNull();
  });

  it('accepts underscores, dots, and uppercase (Better Auth allows them)', () => {
    expect(validateSetupUsername('user_name')).toBeNull();
    expect(validateSetupUsername('user.name')).toBeNull();
    expect(validateSetupUsername('Admin')).toBeNull();
    expect(validateSetupUsername('user.name_1')).toBeNull();
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateSetupUsername('  admin  ')).toBeNull();
  });

  it('rejects hyphens — the case that used to fail at the final setup step', () => {
    const error = validateSetupUsername('qa-admin');
    expect(error).toMatch(/hyphens/i);
    expect(error).toMatch(/letters, numbers, underscores, and dots/i);
  });

  it('rejects spaces and other punctuation', () => {
    expect(validateSetupUsername('a b')).not.toBeNull();
    expect(validateSetupUsername('user@name')).not.toBeNull();
    expect(validateSetupUsername('user/name')).not.toBeNull();
  });

  it('rejects usernames shorter than 3 characters', () => {
    expect(validateSetupUsername('ab')).toMatch(/at least 3/i);
    expect(validateSetupUsername('')).not.toBeNull();
  });

  it('rejects usernames longer than 30 characters', () => {
    expect(validateSetupUsername('a'.repeat(31))).toMatch(/at most 30/i);
    expect(validateSetupUsername('a'.repeat(30))).toBeNull();
  });
});
