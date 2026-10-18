import type { ReactNode } from 'react';

/**
 * PageHeader — the one page-anatomy header (issue #27).
 *
 * Contract:
 * - Title: `text-3xl font-bold`, with an optional muted subtitle line
 *   under it (entity count, e.g. "12 collections", or a concise purpose).
 * - ONE primary action, at the upper right. Callers pass the primary
 *   action as `primaryAction`; it should be the default button style.
 * - Secondary actions are quiet (ghost / outline styles) and render
 *   to the left of the primary action.
 * - Destructive actions are NEVER the primary action — they live in
 *   their own section / confirm dialog, separated from the primary.
 * - On narrow screens the actions stack below the title.
 */
interface PageHeaderProps {
  title: string;
  /** Small adornment rendered inside the h1 after the title (e.g. InfoTooltip). */
  titleAdornment?: ReactNode;
  /** Muted line under the title: entity count or concise purpose. */
  subtitle?: ReactNode;
  /** The ONE primary action (upper right). */
  primaryAction?: ReactNode;
  /** Quiet secondary actions (ghost/outline), left of the primary. */
  secondaryActions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  titleAdornment,
  subtitle,
  primaryAction,
  secondaryActions,
  className = '',
}: PageHeaderProps) {
  return (
    <div
      className={`mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${className}`}
    >
      <div className="min-w-0">
        <h1 className="flex items-start gap-3 text-3xl font-bold text-foreground">
          {title}
          {titleAdornment}
        </h1>
        {subtitle != null && (
          <p className="mt-1 text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {(primaryAction != null || secondaryActions != null) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {secondaryActions}
          {primaryAction}
        </div>
      )}
    </div>
  );
}

/**
 * PageShell — the consistent page-width wrapper (issue #27).
 *
 * Widths come from the layout tokens (--page-max-width-*), so a future
 * branding override (#55) can adjust them in one place. The app shell
 * (DashboardLayout) already supplies px-4 / py-8, so this wrapper only
 * constrains width. `wide` is the default for list pages; `narrow` for
 * detail / form pages; `medium` in between.
 */
interface PageShellProps {
  width?: 'wide' | 'medium' | 'narrow';
  className?: string;
  children: ReactNode;
}

const WIDTH_CLASSES = {
  wide: 'max-w-[var(--page-max-width)]',
  medium: 'max-w-[var(--page-max-width-medium)]',
  narrow: 'max-w-[var(--page-max-width-narrow)]',
} as const;

export function PageShell({
  width = 'wide',
  className = '',
  children,
}: PageShellProps) {
  return (
    <div className={`mx-auto w-full ${WIDTH_CLASSES[width]} ${className}`}>
      {children}
    </div>
  );
}
