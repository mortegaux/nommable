import { useEffect } from 'react';
import { Check, X, Info } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type = 'info', onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const bgColors = {
    success: 'bg-secondary text-secondary-foreground',
    error: 'bg-destructive text-destructive-foreground',
    info: 'bg-accent text-accent-foreground',
  };

  const icons = {
    success: <Check className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />,
    error: <X className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />,
    info: <Info className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />,
  };

  return (
    <div
      className={`${bgColors[type]} px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slide-up`}
      role="alert"
    >
      {icons[type]}
      <span className="font-medium">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 p-1 min-w-6 min-h-6 hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current rounded"
        aria-label="Close notification"
      >
        <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}
