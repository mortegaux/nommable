import { Dialog } from './Dialog';
import { useConfirmStore } from '@/store/confirm.store';

/**
 * Mounted once in App.tsx. Renders the promise-based confirmation
 * dialog (see store/confirm.store.ts) using the shared Dialog.
 */
export function ConfirmHost() {
  const request = useConfirmStore((state) => state.request);
  const resolve = useConfirmStore((state) => state.resolve);

  if (!request) return null;

  const {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = true,
  } = request;

  return (
    <Dialog title={title} onClose={() => resolve(false)} size="small">
      <div className="p-6">
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => resolve(false)}
            className="rounded-lg border border-border bg-background px-4 py-2 font-medium text-foreground hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => resolve(true)}
            autoFocus
            className={
              danger
                ? 'rounded-lg bg-destructive px-4 py-2 font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors focus:outline-none focus:ring-2 focus:ring-destructive'
                : 'rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
