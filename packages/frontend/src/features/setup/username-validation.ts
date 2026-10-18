/**
 * Username rules for the setup wizard's admin account.
 *
 * These mirror the Better Auth `username()` plugin defaults exactly — the
 * backend uses `username()` with no custom options (see
 * `packages/backend/src/lib/auth.ts`), so the defaults from
 * better-auth@1.7.7 `dist/plugins/username/index.mjs` apply:
 *   - default validator: /^[a-zA-Z0-9_.]+$/ (letters, digits, underscore, dot)
 *   - min length 3, max length 30
 *
 * Validating here keeps a bad username from reaching the final setup step,
 * where the auth layer would reject it. If the backend ever passes custom
 * username options to the plugin, update these constants to match.
 */
export const SETUP_USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;
export const SETUP_USERNAME_MIN_LENGTH = 3;
export const SETUP_USERNAME_MAX_LENGTH = 30;

export const SETUP_USERNAME_HINT =
  'Letters, numbers, underscores, and dots only.';

/** Returns an error message for an invalid username, or null when valid. */
export function validateSetupUsername(username: string): string | null {
  const name = username.trim();
  if (name.length < SETUP_USERNAME_MIN_LENGTH) {
    return `Username must be at least ${SETUP_USERNAME_MIN_LENGTH} characters.`;
  }
  if (name.length > SETUP_USERNAME_MAX_LENGTH) {
    return `Username must be at most ${SETUP_USERNAME_MAX_LENGTH} characters.`;
  }
  if (!SETUP_USERNAME_PATTERN.test(name)) {
    return 'Username may only contain letters, numbers, underscores, and dots (no hyphens or spaces).';
  }
  return null;
}
