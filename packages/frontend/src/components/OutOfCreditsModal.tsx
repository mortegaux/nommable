import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Key, X } from 'lucide-react';

export function OutOfCreditsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function handleOutOfCredits() {
      setIsOpen(true);
    }
    window.addEventListener('nommable:out-of-credits', handleOutOfCredits);
    return () => window.removeEventListener('nommable:out-of-credits', handleOutOfCredits);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-xl bg-card border border-border p-6 shadow-2xl">
        <button
          onClick={() => setIsOpen(false)}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 text-amber-500 mb-4">
          <div className="rounded-full bg-amber-500/10 p-3">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-card-foreground">Out of AI Credits</h2>
            <p className="text-xs text-muted-foreground">You have used all your free AI generation credits.</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          To continue using AI features like recipe importing, smart meal planning, and AI food photography, you can either upgrade your plan or bring your own API key (BYOK) for unlimited usage.
        </p>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => {
              setIsOpen(false);
              navigate('/settings');
            }}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Key className="h-4 w-4" />
            Add Personal API Key (BYOK)
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
