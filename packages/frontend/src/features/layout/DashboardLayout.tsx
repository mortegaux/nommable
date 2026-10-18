import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { UserDropdown } from '@/components/UserDropdown';
import { NewRecipeMenu } from '@/components/NewRecipeMenu';
import { FeedbackWidget } from '@/components/FeedbackWidget';
import { RecipeImportExport } from '@/features/recipes/RecipeImportExport';
import { AIGenerateRecipeModal } from '@/features/recipes/AIGenerateRecipeModal';
import { AIConfigAlert } from '@/components/AIConfigAlert';
import { useThemeStore } from '@/store/theme.store';
import { useBrandingStore } from '@/store/branding.store';
import { useRecipeCreateStore } from '@/store/recipeCreate.store';
import { Sun, Moon, Monitor } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

const ThemeToggle = () => {
  const { theme, setTheme } = useThemeStore();
  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const icons = { system: Monitor, light: Sun, dark: Moon };
  const Icon = icons[theme];
  return (
    <button
      onClick={() => setTheme(next[theme])}
      className="p-2.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
      title={`Theme: ${theme}`}
      aria-label={`Theme: ${theme}`}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
};

export default function DashboardLayout() {
  const branding = useBrandingStore((s) => s.branding);
  const appName = branding?.appName ?? 'Nommable';
  const logoSrc = branding?.logoUrl ?? '/logo.png';
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { modal, aiAlertMessage, closeModal, dismissAiAlert } = useRecipeCreateStore();

  const navItems = [
    { path: '/kitchen-today', label: 'Kitchen Today' },
    { path: '/recipes', label: 'Recipes' },
    { path: '/collections', label: 'Collections' },
    { path: '/meal-plans', label: 'Meal Plans' },
    { path: '/shopping-lists', label: 'Shopping Lists' },
    { path: '/pantry', label: 'Pantry' },
    { path: '/batch-cooking', label: 'Batch Cooking' },
  ];

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="flex h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:m-2 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>
      {/* Header */}
      <header className="border-b border-border bg-card shadow-sm">
        <div className="container mx-auto flex items-center justify-between gap-2 px-3 py-3 md:px-4 md:py-4">
          <Link
            to="/kitchen-today"
            className="flex min-w-0 items-center gap-2 text-xl font-bold text-primary md:gap-2.5 md:text-2xl"
            aria-label={`${appName} home`}
          >
            <img
              src={logoSrc}
              alt={`${appName} logo`}
              className="h-7 w-7 shrink-0 rounded-lg object-contain md:h-8 md:w-8"
              onError={(e) => {
                // A broken/missing custom logo falls back to the stock logo,
                // never a broken image.
                const img = e.currentTarget;
                if (!img.dataset.fallback) {
                  img.dataset.fallback = '1';
                  img.src = '/logo.png';
                }
              }}
            />
            <span className="truncate">{appName}</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex lg:space-x-2 xl:space-x-6" role="navigation" aria-label="Main navigation">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`hover:text-primary transition-colors whitespace-nowrap ${
                  isActive(item.path) ? 'font-semibold text-primary' : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
            <NewRecipeMenu />
            <ThemeToggle />
            <UserDropdown />

            {/* Hamburger button */}
            <button
              className="lg:hidden p-2.5 -mr-1 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile nav dropdown */}
        {mobileMenuOpen && (
          <nav
            className="lg:hidden border-t border-border bg-card px-4 py-2"
            role="navigation"
            aria-label="Mobile navigation"
          >
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`block py-3 px-2 rounded-lg hover:bg-accent transition-colors ${
                  isActive(item.path) ? 'font-semibold text-primary' : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 overflow-auto bg-background focus:outline-none"
      >
        <div className="container mx-auto px-4 py-8">
          <Outlet />
        </div>
      </main>

      {/* Global recipe creation — openable from anywhere via NewRecipeMenu */}
      {modal === 'import' && <RecipeImportExport onClose={closeModal} />}
      {modal === 'ai' && <AIGenerateRecipeModal onClose={closeModal} />}
      {aiAlertMessage && <AIConfigAlert onClose={dismissAiAlert} message={aiAlertMessage} />}

      {/* Global feedback widget — available on every page */}
      <FeedbackWidget />
    </div>
  );
}
