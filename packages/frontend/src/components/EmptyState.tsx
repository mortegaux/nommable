import type { ReactNode } from 'react';

/**
 * EmptyState — the one empty-state pattern (issue #27).
 *
 * Dashed-border card, centered: optional icon, title, muted description,
 * and an optional action (usually the same primary action that would
 * create the first item). Pages that already render this shape inline
 * should use this component instead.
 */
interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`rounded-lg border-2 border-dashed border-border bg-card p-12 text-center ${className}`}
    >
      {icon != null && (
        <div className="mb-3 flex justify-center text-muted-foreground">
          {icon}
        </div>
      )}
      <p className="font-medium text-foreground">{title}</p>
      {description != null && (
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      )}
      {action != null && (
        <div className="mt-4 flex justify-center">{action}</div>
      )}
    </div>
  );
}
