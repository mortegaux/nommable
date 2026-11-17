import { useCallback, useEffect, useRef, useState } from 'react';
import { aiApi } from '@/services/api';
import type { AIConfigStatus } from '@/utils/aiValidation';
import { checkAIConfiguration } from '@/utils/aiValidation';

/**
 * useAIStatus — shared, cached AI configuration status.
 *
 * Fetches GET /api/ai/status once per page load and shares the result
 * across all consumers. Individual components can call `refresh()` after
 * AI settings change (e.g. returning from the AI settings page).
 *
 * Usage:
 *   const { isReady, isLoading, refresh } = useAIStatus();
 *   // isReady = isConfigured && isEnabled
 */

// Module-level cache — survives across hook instances within a page load.
let cachedStatus: AIConfigStatus | null = null;
let inflight: Promise<AIConfigStatus> | null = null;
const subscribers = new Set<() => void>();

function notifySubscribers() {
  subscribers.forEach((fn) => fn());
}

async function fetchStatus(): Promise<AIConfigStatus> {
  if (cachedStatus) return cachedStatus;
  if (inflight) return inflight;
  inflight = checkAIConfiguration().finally(() => {
    inflight = null;
  });
  const status = await inflight;
  cachedStatus = status;
  notifySubscribers();
  return status;
}

export function invalidateAIStatus() {
  cachedStatus = null;
  notifySubscribers();
}

export interface AIStatusResult {
  /** Raw status from the backend (null while loading). */
  status: AIConfigStatus | null;
  /** True when AI is configured AND enabled — safe to show AI features as active. */
  isReady: boolean;
  /** True on the very first load before we know the status. */
  isLoading: boolean;
  /** Re-fetch from the backend (e.g. after saving AI settings). */
  refresh: () => Promise<void>;
}

export function useAIStatus(): AIStatusResult {
  const [, forceUpdate] = useState(0);
  const mounted = useRef(true);

  const rerender = useCallback(() => {
    if (mounted.current) forceUpdate((n) => n + 1);
  }, []);

  useEffect(() => {
    mounted.current = true;
    subscribers.add(rerender);
    // Kick off the fetch on first mount if we don't have data yet.
    if (!cachedStatus) {
      void fetchStatus();
    }
    return () => {
      mounted.current = false;
      subscribers.delete(rerender);
    };
  }, [rerender]);

  const refresh = useCallback(async () => {
    cachedStatus = null;
    await fetchStatus();
  }, []);

  const status = cachedStatus;
  return {
    status,
    isReady: !!status && status.isConfigured && status.isEnabled,
    isLoading: !status,
    refresh,
  };
}

/**
 * CSS classes to visually distinguish an AI button when AI isn't set up.
 * Apply alongside the button's normal classes when `!isReady`.
 *
 * The treatment: dimmed, with the button's normal border — clearly "this
 * exists but needs setup" rather than broken or fully functional. The
 * "Setup" label from AISetupBadge carries the explanation.
 */
export const aiNotConfiguredClass = 'opacity-60';

/**
 * Small label shown on AI buttons when AI isn't configured.
 * Render inside the button when `!isReady`.
 */
export function AISetupBadge() {
  return (
    <span className="ml-1 text-xs font-normal text-muted-foreground">
      Setup
    </span>
  );
}

// Re-export for convenience so consumers only import from one place.
export type { AIConfigStatus };
export { aiApi };
