import { toAuthValidationError } from '../api/controllers/setup.controller';
import { AppError } from '../api/middleware/error-handler';

/**
 * Covers the setup endpoint's conversion of Better Auth validation errors
 * into AppErrors carrying the real status/message (issue #56). The route
 * tests use a Better Auth mock whose signUpEmail performs no username
 * validation, so the conversion is tested here with error objects shaped
 * like the real APIError: { statusCode, body: { message, code } }.
 */
describe('toAuthValidationError (setup controller)', () => {
  it('converts INVALID_USERNAME to AppError 400 with the real message', () => {
    const error = {
      statusCode: 400,
      body: { message: 'Username is invalid', code: 'INVALID_USERNAME' },
    };
    const result = toAuthValidationError(error);
    expect(result).toBeInstanceOf(AppError);
    expect(result?.statusCode).toBe(400);
    expect(result?.message).toBe('Username is invalid');
  });

  it('converts the other allowlisted username validation codes', () => {
    for (const [code, message] of [
      ['USERNAME_TOO_SHORT', 'Username is too short'],
      ['USERNAME_TOO_LONG', 'Username is too long'],
      ['USERNAME_IS_ALREADY_TAKEN', 'Username is already taken. Please try another.'],
    ] as const) {
      const result = toAuthValidationError({ statusCode: 400, body: { message, code } });
      expect(result?.statusCode).toBe(400);
      expect(result?.message).toBe(message);
    }
  });

  it('keeps non-validation errors as null (generic 500 path)', () => {
    // Server-side / unknown errors must not be surfaced with their message.
    expect(
      toAuthValidationError({ statusCode: 500, body: { message: 'boom', code: 'UNEXPECTED_ERROR' } })
    ).toBeNull();
    expect(
      toAuthValidationError({ statusCode: 400, body: { message: 'boom', code: 'SOME_UNKNOWN_CODE' } })
    ).toBeNull();
    expect(toAuthValidationError(new Error('plain error'))).toBeNull();
    expect(toAuthValidationError(null)).toBeNull();
    expect(toAuthValidationError({ statusCode: 400, body: { message: 'no code' } })).toBeNull();
  });
});
