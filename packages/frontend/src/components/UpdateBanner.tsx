import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, X } from 'lucide-react';
import api from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

/**
 * Minimal shape of GET /api/settings/system that this banner needs.
 * Mirrors the shared SystemStatus type (issue #23) without importing it:
 * the local shared package predates that type, and this keeps the banner
 * decoupled from the System tab's full diagnostics payload.
 */
interface SystemStatusResponse {
  installedVersion: string;
  available: {
    status: string;
    version: string | null;
    updateAvailable: boolean;
  };
}

const DISMISSED_KEY_PREFIX = 'nommable:update-banner-dismissed:';

export function dismissedVersionKey(version: string): string {
  return `${DISMISSED_KEY_PREFIX}${version}`;
}

export function isDismissedForVersion(version: string): boolean {
  try {
    return localStorage.getItem(dismissedVersionKey(version)) === '1';
  } catch {
    return false;
  }
}

export function dismissForVersion(version: string): void {
  try {
    localStorage.setItem(dismissedVersionKey(version), '1');
  } catch {
    // Storage unavailable (private mode, etc.) — the banner just reappears.
  }
}

/**
 * Small, unobtrusive update banner (issue #52) — a compact pill that sits to
 * the LEFT of the floating feedback button, never over it.
 *
 * - Renders only for admins, and only when GET /api/settings/system reports
 *   an update is available (updateAvailable + a non-null available version).
 * - Fetches once on mount; no polling loop, no interval. The backend caches
 *   the GitHub latest-release lookup for 1h, so this is the same cached
 *   version check the System tab uses.
 * - Dismissal is persisted per available version in localStorage: dismissing
 *   hides the banner until a *different* version becomes available.
 * - Clicking the pill navigates to Settings → System tab
 *   (/settings?tab=system), where the update details live.
 * - Never renders for non-admins, and never fetches the admin-only endpoint
 *   as a non-admin.
 * - Positioning: the feedback button is `fixed bottom-4 right-4` (40px
 *   wide, so it spans 16–56px from the right edge). This pill is
 *   `right-[4.5rem]` (72px), leaving a 16px gap, at the same height
 *   (h-10), so the two fixed elements can never overlap at any width.
 *   max-width keeps the pill from touching the left edge on narrow screens.
 */
export function UpdateBanner() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    api
      .get<SystemStatusResponse>('/settings/system')
      .then((res) => {
        if (cancelled) return;
        const available = res.data?.available;
        if (available?.updateAvailable && available.version) {
          setAvailableVersion(available.version);
        }
      })
      .catch(() => {
        // Endpoint failure → no banner. The System tab shows the degraded
        // state; the banner must never error or block the page.
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!isAdmin || !availableVersion || dismissed || isDismissedForVersion(availableVersion)) {
    return null;
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    dismissForVersion(availableVersion);
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-4 right-[4.5rem] z-40 flex h-10 max-w-[calc(100vw-9rem)] items-center">
      <button
        type="button"
        onClick={() => navigate('/settings?tab=system')}
        title={`Update available: ${availableVersion} — view in System settings`}
        aria-label={`Update available: version ${availableVersion}. Go to System settings`}
        className="flex h-10 min-w-0 items-center gap-1.5 rounded-full border border-primary/30 bg-card pl-3 pr-2 text-sm font-medium text-foreground shadow-md transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <ArrowUpRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate">Update available · {availableVersion}</span>
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        title="Dismiss this update notification"
        aria-label="Dismiss update notification"
        className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
