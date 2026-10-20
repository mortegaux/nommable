import { Link, useLocation } from 'react-router-dom';

export type SectionTab = { path: string; label: string };

/**
 * Mobile-only segmented strip linking sibling sections that share a slot in
 * the bottom tab bar (Recipes ↔ Collections, Meal Plans ↔ Batch Cooking).
 * Hidden on desktop — the sidebar lists every section there.
 */
export function SectionTabs({ tabs, label }: { tabs: SectionTab[]; label: string }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label={label} className="mb-4 lg:hidden">
      <div className="inline-flex gap-1 rounded-xl bg-muted p-1">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.path);
          return (
            <Link
              key={tab.path}
              to={tab.path}
              aria-current={active ? 'page' : undefined}
              className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                active
                  ? 'bg-card font-semibold text-primary shadow-sm'
                  : 'font-medium text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
