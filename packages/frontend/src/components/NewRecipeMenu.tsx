import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, PenLine, Link2, Sparkles } from 'lucide-react';
import { useRecipeCreateStore } from '@/store/recipeCreate.store';
import { useAIStatus, AISetupBadge } from '@/hooks/useAIStatus';

/**
 * Global "+ New" recipe menu, mounted in the DashboardLayout header so a
 * recipe can be added from anywhere in the app:
 *
 * - Create manually → navigates to /recipes/new
 * - Import from URL → opens the global Import modal
 * - Generate with AI → opens the global AI modal (with config check)
 *
 * Keyboard: pressing "n" outside of text inputs toggles the menu.
 */
export function NewRecipeMenu({
  variant = 'button',
  iconOnly = false,
}: {
  variant?: 'button' | 'nav';
  iconOnly?: boolean;
} = {}) {
  const navigate = useNavigate();
  const { openImport, openAIGenerate } = useRecipeCreateStore();
  const { isReady: aiReady, isLoading: aiLoading } = useAIStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click / Escape; return focus to the button on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // Global "n" shortcut — ignored while typing or with modifiers held.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setMenuOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const closeAnd = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  const items = [
    {
      label: 'Create manually',
      hint: 'Start from a blank form',
      Icon: PenLine,
      onSelect: closeAnd(() => navigate('/recipes/new')),
    },
    {
      label: 'Import from URL',
      hint: 'Link, pasted text, or photo',
      Icon: Link2,
      onSelect: closeAnd(() => openImport()),
    },
    {
      label: 'Generate with AI',
      hint: aiReady || aiLoading ? 'Describe it and let AI draft it' : 'Set up AI to unlock',
      Icon: Sparkles,
      onSelect: closeAnd(() => void openAIGenerate()),
      needsSetup: !aiReady && !aiLoading,
    },
  ];

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Add a new recipe"
        title="Add a new recipe (N)"
        className={
          variant === 'nav'
            ? `flex items-center gap-3 rounded-lg text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                iconOnly ? 'justify-center px-0 py-2.5' : 'w-full px-3 py-2.5'
              }`
            : 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
        }
      >
        <Plus
          className={variant === 'nav' ? 'h-5 w-5 shrink-0' : 'h-4 w-4'}
          aria-hidden="true"
        />
        {variant === 'nav' ? (
          !iconOnly && <span>New</span>
        ) : (
          <span className="hidden sm:inline">New</span>
        )}
      </button>

      {menuOpen && (
        <div
          role="menu"
          aria-label="Add a new recipe"
          className={`absolute z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-xl ${
            variant === 'nav' ? 'left-0' : 'right-0'
          }`}
        >
          {items.map(({ label, hint, Icon, onSelect, needsSetup }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={onSelect}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent focus:bg-accent focus:outline-none focus:ring-2 focus:ring-primary ${needsSetup ? 'opacity-70' : ''}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${needsSetup ? 'bg-warning/15 text-warning' : 'bg-primary/10 text-primary'}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {label}
                  {needsSetup && <AISetupBadge />}
                </span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
