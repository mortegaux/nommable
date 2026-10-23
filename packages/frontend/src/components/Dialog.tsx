import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  /** Accessible name for the dialog — rendered as the visible title. */
  title: string;
  /** Optional id for aria-describedby. */
  descriptionId?: string;
  onClose: () => void;
  children: ReactNode;
  /** Extra classes for the dialog panel. */
  panelClassName?: string;
  /** Show the × close button in the header. Default true. */
  showCloseButton?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal dialog. Handles:
 * - role="dialog" + aria-modal + labelledby
 * - focus trap (Tab cycles inside)
 * - Escape closes (capture phase, so inner handlers can't swallow it)
 * - initial focus on the first focusable element
 * - focus return to the element that opened the dialog
 * - backdrop click closes
 * - body scroll lock while open
 *
 * Usage:
 *   {open && (
 *     <Dialog title="Generate Recipe with AI" onClose={() => setOpen(false)}>
 *       ...dialog body...
 *     </Dialog>
 *   )}
 */
export function Dialog({
  title,
  descriptionId,
  onClose,
  children,
  panelClassName = '',
  showCloseButton = true,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2, 9)}`);
  // Keep the latest onClose in a ref so the mount-once effect below never
  // goes stale — and never re-runs (yanking focus back to the first
  // element) when a parent re-renders with a new onClose identity, e.g.
  // typing in a form inside the dialog.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Remember the trigger so focus can return to it.
  useEffect(() => {
    triggerRef.current = document.activeElement;
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    // Initial focus: first focusable element, else the panel itself.
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    // Capture phase so inner stopPropagation can't swallow Escape/Tab.
    document.addEventListener('keydown', handleKeyDown, true);

    // Lock body scroll while open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = prevOverflow;
      // Return focus to the trigger.
      const trigger = triggerRef.current;
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl bg-card shadow-2xl focus:outline-none ${panelClassName}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border p-6">
          <h2 id={titleId.current} className="text-2xl font-bold text-foreground">
            {title}
          </h2>
          {showCloseButton && (
            <button
              onClick={onClose}
              aria-label={`Close ${title}`}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
}
