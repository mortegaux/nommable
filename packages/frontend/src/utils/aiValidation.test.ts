import { describe, it, expect } from 'vitest';
import { aiErrorMessage, aiUnavailableMessage, type AIConfigStatus } from './aiValidation';

describe('aiErrorMessage', () => {
  it('maps AI_KEY_REQUIRED to the add-your-key guidance', () => {
    const err = { response: { data: { code: 'AI_KEY_REQUIRED', error: 'raw' } } };
    expect(aiErrorMessage(err, 'fallback')).toMatch(/Add your API key in Settings/);
  });

  it('maps AI_NOT_CONFIGURED to the instance guidance', () => {
    const err = { response: { data: { code: 'AI_NOT_CONFIGURED', error: 'raw' } } };
    expect(aiErrorMessage(err, 'fallback')).toMatch(/isn't configured on this instance/);
  });

  it('passes through the provider message for AI_PROVIDER_ERROR', () => {
    const err = {
      response: { data: { code: 'AI_PROVIDER_ERROR', error: 'AI provider error: Incorrect API key provided' } },
    };
    expect(aiErrorMessage(err, 'fallback')).toBe('AI provider error: Incorrect API key provided');
  });

  it('maps OUT_OF_CREDITS to the credits guidance', () => {
    const err = { response: { data: { code: 'OUT_OF_CREDITS', error: 'raw' } } };
    expect(aiErrorMessage(err, 'fallback')).toMatch(/out of AI credits/i);
  });

  it('falls back to the server message, then the caller fallback', () => {
    expect(aiErrorMessage({ response: { data: { error: 'specific' } } }, 'fallback')).toBe('specific');
    expect(aiErrorMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });
});

describe('aiUnavailableMessage', () => {
  const base: AIConfigStatus = {
    isConfigured: false,
    isEnabled: false,
    provider: null,
    isReachable: true,
  };

  it('per-user mode points at the user’s own key', () => {
    expect(aiUnavailableMessage({ ...base, mode: 'per-user' })).toMatch(/your own API key/);
  });

  it('other modes point at admin setup', () => {
    expect(aiUnavailableMessage({ ...base, mode: 'shared' })).toMatch(/admin can set it up/);
    expect(aiUnavailableMessage({ ...base, mode: 'managed' })).toMatch(/admin can set it up/);
  });

  it('network failure wins over mode copy', () => {
    expect(aiUnavailableMessage({ ...base, isReachable: false, mode: 'per-user' })).toMatch(
      /Couldn't reach/
    );
  });
});
