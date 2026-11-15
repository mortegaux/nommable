import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  itemCount: number;
  onPageChange: (page: number) => void;
  onLoadMore?: () => void;
  isLoading?: boolean;
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize: _pageSize,
  itemCount,
  onPageChange,
  onLoadMore,
  isLoading,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(page, totalPages);
  const hasMore = page < totalPages;

  return (
    <>
      {/* Compact "Load More" variant: visible only below the md breakpoint.
          CSS (not JS width checks) decides which variant shows, so there is
          no layout shift or hydration mismatch on resize. */}
      {onLoadMore && (
        <div className="flex flex-col items-center gap-2 py-4 md:hidden">
          <p className="text-sm tabular-nums text-muted-foreground">
            Showing {itemCount} of {total}
          </p>
          {hasMore && (
            <button
              onClick={onLoadMore}
              disabled={isLoading}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? 'Loading' : 'Load more'}
            </button>
          )}
        </div>
      )}

      {/* Numbered pagination. Hidden on small screens when the Load More
          variant takes over (display:none keeps it out of the a11y tree too). */}
      <nav
        aria-label="Pagination"
        className={`items-center justify-center gap-1 py-4 tabular-nums ${
          onLoadMore ? 'hidden md:flex' : 'flex'
        }`}
      >
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || isLoading}
          aria-label="Previous page"
          className="px-3 py-1 rounded border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-2 py-1" aria-hidden="true">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              disabled={isLoading}
              aria-label={`Go to page ${p}`}
              aria-current={p === page ? 'page' : undefined}
              className={`px-3 py-1 rounded border transition-colors ${
                p === page
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || isLoading}
          aria-label="Next page"
          className="px-3 py-1 rounded border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </nav>
    </>
  );
}

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | '...')[] = [1];

  if (current > 3) pages.push('...');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push('...');

  pages.push(total);
  return pages;
}
