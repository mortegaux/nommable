import { useState } from 'react';
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
import {
  Sun,
  Moon,
  Monitor,
  LayoutDashboard,
  BookOpen,
  Layers,
  CalendarDays,
  CookingPot,
  ShoppingCart,
  Package,
  Home,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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

type NavEntry = { path: string; label: string; Icon: LucideIcon };
type NavGroup = { label: string | null; items: NavEntry[] };

// Sidebar destinations, grouped for scanning. Flat list — no dropdowns.
const navGroups: NavGroup[] = [
  { label: null, items: [{ path: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard }] },
  {
    label: 'Kitchen',
    items: [
      { path: '/recipes', label: 'Recipes', Icon: BookOpen },
      { path: '/collections', label: 'Collections', Icon: Layers },
      { path: '/meal-plans', label: 'Meal Plans', Icon: CalendarDays },
      { path: '/batch-cooking', label: 'Batch Cooking', Icon: CookingPot },
    ],
  },
  {
    label: 'Household',
    items: [
      { path: '/shopping-lists', label: 'Shopping Lists', Icon: ShoppingCart },
      { path: '/pantry', label: 'Pantry', Icon: Package },
    ],
  },
];

// Bottom tab bar destinations — the five thumb-reachable primaries.
// Collections and Batch Cooking live in-section via SectionTabs.
const tabBarItems: NavEntry[] = [
  { path: '/dashboard', label: 'Dashboard', Icon: Home },
  { path: '/recipes', label: 'Recipes', Icon: BookOpen },
  { path: '/meal-plans', label: 'Plans', Icon: CalendarDays },
  { path: '/shopping-lists', label: 'Lists', Icon: ShoppingCart },
  { path: '/pantry', label: 'Pantry', Icon: Package },
];

const SIDEBAR_COLLAPSED_KEY = 'nommable:sidebar-collapsed';

function SidebarLink({
  entry,
  active,
  collapsed,
}: {
  entry: NavEntry;
  active: boolean;
  collapsed: boolean;
}) {
  const { Icon } = entry;
  return (
    <Link
      to={entry.path}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? entry.label : undefined}
      className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
      } ${
        active
          ? 'bg-muted font-semibold text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <Icon
        className={`h-5 w-5 shrink-0 ${active ? 'text-primary' : ''}`}
        aria-hidden="true"
      />
      {!collapsed && <span className="truncate">{entry.label}</span>}
    </Link>
  );
}

function Logo({ appName, logoSrc }: { appName: string; logoSrc: string }) {
  return (
    <Link
      to="/dashboard"
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
  );
}

export default function DashboardLayout() {
  const branding = useBrandingStore((s) => s.branding);
  const appName = branding?.appName ?? 'Nommable';
  const logoSrc = branding?.logoUrl ?? '/logo.png';
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const { modal, aiAlertMessage, closeModal, dismissAiAlert } = useRecipeCreateStore();

  const isActive = (path: string) => location.pathname.startsWith(path);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // private browsing — collapse state just won't persist
      }
      return next;
    });
  };

  return (
    <div className="flex h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:m-2 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Desktop sidebar (lg+) */}
      <aside
        aria-label="Main sidebar"
        className={`hidden lg:flex h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className={`flex items-center gap-2 pt-4 ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
          <Link
            to="/dashboard"
            aria-label={`${appName} home`}
            className="flex min-w-0 items-center gap-2.5"
            title={collapsed ? `${appName} home` : undefined}
          >
            <img
              src={logoSrc}
              alt={`${appName} logo`}
              className="h-8 w-8 shrink-0 rounded-lg object-contain"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.dataset.fallback) {
                  img.dataset.fallback = '1';
                  img.src = '/logo.png';
                }
              }}
            />
            {!collapsed && (
              <span className="truncate text-lg font-bold text-primary">{appName}</span>
            )}
          </Link>
        </div>

        <div className={`${collapsed ? 'flex justify-center px-1' : 'px-3'} pb-2 pt-4`}>
          <NewRecipeMenu variant="nav" iconOnly={collapsed} />
        </div>

        <nav
          aria-label="Main navigation"
          className={`flex-1 space-y-5 overflow-y-auto ${collapsed ? 'px-2' : 'px-3'} py-2`}
        >
          {navGroups.map((group, gi) => (
            <div key={group.label ?? 'top'} className="space-y-1">
              {group.label && !collapsed && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
              )}
              {group.label && collapsed && gi > 0 && (
                <div className="mx-2 border-t border-border" aria-hidden="true" />
              )}
              {group.items.map((entry) => (
                <SidebarLink
                  key={entry.path}
                  entry={entry}
                  active={isActive(entry.path)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          ))}
        </nav>

        <div
          className={`flex items-center gap-1 border-t border-border p-2 ${
            collapsed ? 'flex-col' : ''
          }`}
        >
          <ThemeToggle />
          {collapsed ? (
            <div
              className="flex h-12 w-10 items-center justify-start overflow-hidden"
              title="Account"
            >
              <UserDropdown />
            </div>
          ) : (
            <UserDropdown />
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-2.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors lg:ml-auto"
          >
            {collapsed ? (
              <ChevronsRight className="h-5 w-5" aria-hidden="true" />
            ) : (
              <ChevronsLeft className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Slim top header (mobile only) */}
        <header className="border-b border-border bg-card shadow-sm lg:hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-3">
            <Logo appName={appName} logoSrc={logoSrc} />
            <div className="flex shrink-0 items-center gap-1.5">
              <NewRecipeMenu />
              <ThemeToggle />
              <UserDropdown />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-auto bg-background pb-24 focus:outline-none lg:pb-0"
        >
          <div className="container mx-auto px-4 py-8">
            <Outlet />
          </div>
        </main>

        {/* Bottom tab bar (mobile only) */}
        <nav
          aria-label="Bottom navigation"
          className="fixed bottom-0 inset-x-0 z-50 grid grid-cols-5 border-t border-border bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {tabBarItems.map(({ path, label, Icon }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                aria-current={active ? 'page' : undefined}
                className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 pt-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <span
                  className={`flex items-center justify-center rounded-full px-3.5 py-1 transition-colors ${
                    active ? 'bg-primary/10' : ''
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted-foreground'}`}
                    aria-hidden="true"
                  />
                </span>
                <span
                  className={`text-[11px] leading-tight ${
                    active ? 'font-semibold text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Global recipe creation — openable from anywhere via NewRecipeMenu */}
        {modal === 'import' && <RecipeImportExport onClose={closeModal} />}
        {modal === 'ai' && <AIGenerateRecipeModal onClose={closeModal} />}
        {aiAlertMessage && <AIConfigAlert onClose={dismissAiAlert} message={aiAlertMessage} />}

        {/* Global feedback widget — available on every page */}
        <FeedbackWidget />
      </div>
    </div>
  );
}
