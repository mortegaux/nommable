import type { ReactNode } from 'react';

/**
 * Callout — the one callout / alert panel pattern (issue #27).
 *
 * Tones map to the semantic state tokens, so callout colors never use
 * raw feature-level colors. Text always uses the tone's soft-foreground
 * on the tone's soft background — every pairing meets WCAG AA (4.5:1)
 * in both themes (see docs/design-tokens.md).
 *
 * - info: neutral explanation / how-it-works
 * - success: completed / confirmed state
 * - warning: caution / cost notice / attention needed
 * - error: failure / destructive confirmation context (NOT a substitute
 *   for the destructive confirm dialog)
 */
export type CalloutTone = 'info' | 'success' | 'warning' | 'error';

interface CalloutProps {
  tone?: CalloutTone;
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** e.g. "alert" for error states that must be announced. */
  role?: string;
}

const TONE_CLASSES: Record<CalloutTone, string> = {
  info: 'border-info/30 bg-info-soft text-info-soft-foreground',
  success: 'border-success/30 bg-success-soft text-success-soft-foreground',
  warning: 'border-warning/30 bg-warning-soft text-warning-soft-foreground',
  error:
    'border-destructive/30 bg-destructive-soft text-destructive-soft-foreground',
};

export function Callout({
  tone = 'info',
  title,
  icon,
  children,
  className = '',
  role,
}: CalloutProps) {
  return (
    <div
      role={role}
      className={`rounded-lg border p-4 ${TONE_CLASSES[tone]} ${className}`}
    >
      <div className="flex gap-3">
        {icon != null && <div className="flex-shrink-0">{icon}</div>}
        <div className="min-w-0 flex-1">
          {title != null && (
            <h3 className="mb-1 font-semibold">{title}</h3>
          )}
          <div className="text-sm opacity-90">{children}</div>
        </div>
      </div>
    </div>
  );
}
