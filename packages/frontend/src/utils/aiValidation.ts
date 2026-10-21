import { aiApi } from '@/services/api';
import type { AIMode } from '@nommable/shared';

export interface AIConfigStatus {
  isConfigured: boolean;
  isEnabled: boolean;
  provider: string | null;
  mode?: AIMode;
  managed?: boolean;
  hasPersonalKey?: boolean;
  /**
   * False when the status check itself failed at the network level
   * (server unreachable, timeout, connection refused). Distinct from
   * "reachable but not configured" — callers should show a retry
   * message instead of the "AI Not Configured" prompt.
   */
  isReachable: boolean;
}

/**
 * Check if AI is properly configured and enabled.
 * Network failures are reported separately via `isReachable: false`
 * so callers don't mislead with "AI Not Configured" when the backend
 * simply can't be reached.
 */
export async function checkAIConfiguration(): Promise<AIConfigStatus> {
  try {
    const response = await aiApi.getStatus();
    return { ...response.data, isReachable: true };
  } catch (error: any) {
    const isNetworkError =
      !error?.response || error?.code === 'ECONNABORTED' || error?.code === 'ERR_NETWORK';
    return {
      isConfigured: false,
      isEnabled: false,
      provider: null,
      isReachable: !isNetworkError,
    };
  }
}

/**
 * Copy for the AI-unavailable prompt. Callers already rendering
 * <AIConfigAlert> can pass the result straight through:
 *
 *   const status = await checkAIConfiguration();
 *   if (!status.isConfigured || !status.isEnabled) {
 *     setAiAlertMessage(aiUnavailableMessage(status));
 *     setShowAIConfigAlert(true);
 *     return;
 *   }
 *   // <AIConfigAlert onClose={...} message={aiAlertMessage} />
 */
export function aiUnavailableMessage(status: AIConfigStatus): string {
  if (!status.isReachable) {
    return "Couldn't reach the AI service. Check your connection and try again — your work is saved.";
  }
  if (status.mode === 'per-user') {
    return 'AI features need your own API key. Add one in Settings → AI to enable them.';
  }
  return "AI isn't configured on this instance yet. An admin can set it up in Settings → AI.";
}

/**
 * User-facing message for a failed AI action, driven by the backend's
 * machine-readable error code rather than raw server text:
 * - AI_KEY_REQUIRED (403): the caller needs to add their own key;
 * - AI_NOT_CONFIGURED (400): the instance has no usable AI at all;
 * - OUT_OF_CREDITS (402): managed credits are exhausted (the global
 *   interceptor also opens the out-of-credits modal for 402s).
 * Anything else falls back to the server's message, then the caller's.
 */
export function aiErrorMessage(error: any, fallback: string): string {
  const code = error?.response?.data?.code;
  if (code === 'AI_KEY_REQUIRED') {
    return 'Add your API key in Settings → AI to use this feature.';
  }
  if (code === 'AI_NOT_CONFIGURED') {
    return "AI isn't configured on this instance yet.";
  }
  if (code === 'OUT_OF_CREDITS') {
    return "You're out of AI credits. Add your own API key in Settings → AI for unlimited use.";
  }
  return error?.response?.data?.error || fallback;
}
