import { useCallback, useEffect, useState } from 'react';
import { feedbackApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { useToastStore } from '@/store/toast.store';
import { PageHeader } from '@/components/PageHeader';

/**
 * Local minimal types for the feedback inbox.
 * NOTE: @nommable/shared does not export FeedbackReport yet (the backend
 * feedback feature is landing in parallel). When it does, replace this with
 * `import type { FeedbackReport } from '@nommable/shared';` and delete below.
 */
export type FeedbackType = 'bug' | 'feature';
export type FeedbackStatus = 'open' | 'in-progress' | 'resolved';

export interface FeedbackReport {
  id: string;
  type: FeedbackType;
  summary: string;
  details?: string;
  route?: string;
  userAgent?: string;
  viewport?: string;
  appVersion?: string;
  userId?: string;
  username?: string;
  status: FeedbackStatus;
  createdAt: string;
  updatedAt: string;
}

type TypeFilter = 'all' | FeedbackType;
type StatusFilter = 'all' | FeedbackStatus;

const TYPE_BADGE: Record<FeedbackType, string> = {
  bug: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700',
  feature: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700',
};

const STATUS_BADGE: Record<FeedbackStatus, string> = {
  open: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700',
  'in-progress': 'bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 border-violet-300 dark:border-violet-700',
  resolved: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700',
};

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: 'Open',
  'in-progress': 'In progress',
  resolved: 'Resolved',
};

const FILTER_BUTTON =
  'px-3 py-1.5 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-primary';
const FILTER_ACTIVE = 'bg-primary text-primary-foreground border-primary';
const FILTER_INACTIVE =
  'bg-card text-card-foreground border-border hover:bg-accent hover:text-accent-foreground';

function formatRelative(dateStr: string): string {
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return dateStr;
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatAbsolute(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString();
}

export default function FeedbackInboxPage() {
  const user = useAuthStore((s) => s.user);
  const toast = useToastStore();

  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params: { type?: FeedbackType; status?: FeedbackStatus } = {};
      if (typeFilter !== 'all') params.type = typeFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await feedbackApi.list(params);
      setReports(Array.isArray(data) ? data : []);
    } catch {
      setLoadError('Could not load feedback reports. Try again.');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchReports();
    }
  }, [fetchReports, user]);

  const handleStatusChange = async (report: FeedbackReport, status: FeedbackStatus) => {
    setUpdatingId(report.id);
    try {
      const { data } = await feedbackApi.updateStatus(report.id, status);
      const updated = data as FeedbackReport;
      setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, ...updated } : r)));
      toast.success(
        status === 'resolved'
          ? 'Marked as resolved'
          : status === 'in-progress'
            ? 'Marked as in progress'
            : 'Reopened'
      );
    } catch {
      toast.error('Failed to update status — try again');
    } finally {
      setUpdatingId(null);
    }
  };

  const renderFilters = (
    label: string,
    options: Array<{ value: string; label: string }>,
    value: string,
    onChange: (v: string) => void
  ) => (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm font-medium text-muted-foreground">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`${FILTER_BUTTON} ${value === opt.value ? FILTER_ACTIVE : FILTER_INACTIVE}`}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  // Admin guard (App.tsx also wraps this route in AdminRoute; this is the fallback
  // if the page is ever rendered elsewhere).
  if (user?.role !== 'admin') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-card-foreground">Not authorized</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The feedback inbox is only available to administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <PageHeader
        title="Feedback inbox"
        subtitle="Bug reports and feature requests submitted by users. Click a report to see details."
      />

      <div className="mt-4 flex flex-col gap-3">
        {renderFilters(
          'Type',
          [
            { value: 'all', label: 'All' },
            { value: 'bug', label: 'Bug' },
            { value: 'feature', label: 'Feature' },
          ],
          typeFilter,
          (v) => setTypeFilter(v as TypeFilter)
        )}
        {renderFilters(
          'Status',
          [
            { value: 'all', label: 'All' },
            { value: 'open', label: 'Open' },
            { value: 'in-progress', label: 'In progress' },
            { value: 'resolved', label: 'Resolved' },
          ],
          statusFilter,
          (v) => setStatusFilter(v as StatusFilter)
        )}
      </div>

      <div className="mt-6">
        {loading && (
          <div className="py-16 text-center text-muted-foreground">Loading feedback…</div>
        )}

        {!loading && loadError && (
          <div className="py-8 text-center">
            <p className="text-destructive text-sm">{loadError}</p>
            <button
              type="button"
              onClick={fetchReports}
              className="mt-3 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !loadError && reports.length === 0 && (
          <div className="py-16 text-center border border-dashed border-border rounded-xl">
            <p className="text-card-foreground font-medium">No reports yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing here matches the current filters.
            </p>
          </div>
        )}

        {!loading && !loadError && reports.length > 0 && (
          <ul className="space-y-2">
            {reports.map((report) => {
              const expanded = expandedId === report.id;
              const updating = updatingId === report.id;
              return (
                <li
                  key={report.id}
                  className="bg-card border border-border rounded-xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : report.id)}
                    aria-expanded={expanded}
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-accent/40 transition-colors focus:outline-none focus:bg-accent/60"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${TYPE_BADGE[report.type]}`}
                        >
                          {report.type === 'bug' ? 'Bug' : 'Feature'}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_BADGE[report.status]}`}
                        >
                          {STATUS_LABEL[report.status]}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-card-foreground break-words">
                        {report.summary}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {report.route ? `${report.route} · ` : ''}
                        {report.username || report.userId || 'Anonymous'} ·{' '}
                        {formatRelative(report.createdAt)}
                      </p>
                    </div>
                    <svg
                      className={`w-5 h-5 mt-1 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {expanded && (
                    <div className="border-t border-border px-4 py-4">
                      {report.details && (
                        <div className="mb-4">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Details
                          </h3>
                          <p className="mt-1 text-sm text-card-foreground whitespace-pre-wrap break-words">
                            {report.details}
                          </p>
                        </div>
                      )}

                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Captured context
                      </h3>
                      <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground shrink-0">Route:</dt>
                          <dd className="text-card-foreground break-all">{report.route || '—'}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground shrink-0">App version:</dt>
                          <dd className="text-card-foreground break-all">{report.appVersion || '—'}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground shrink-0">Viewport:</dt>
                          <dd className="text-card-foreground break-all">{report.viewport || '—'}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground shrink-0">Submitted:</dt>
                          <dd className="text-card-foreground">{formatAbsolute(report.createdAt)}</dd>
                        </div>
                        <div className="sm:col-span-2 flex gap-2">
                          <dt className="text-muted-foreground shrink-0">User agent:</dt>
                          <dd className="text-card-foreground break-all">{report.userAgent || '—'}</dd>
                        </div>
                      </dl>

                      <div className="mt-4 flex gap-2 flex-wrap">
                        {report.status === 'open' && (
                          <button
                            type="button"
                            disabled={updating}
                            onClick={() => handleStatusChange(report, 'in-progress')}
                            className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            {updating ? 'Updating…' : 'Mark in progress'}
                          </button>
                        )}
                        {report.status !== 'resolved' && (
                          <button
                            type="button"
                            disabled={updating}
                            onClick={() => handleStatusChange(report, 'resolved')}
                            className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {updating ? 'Updating…' : 'Mark resolved'}
                          </button>
                        )}
                        {report.status === 'resolved' && (
                          <button
                            type="button"
                            disabled={updating}
                            onClick={() => handleStatusChange(report, 'open')}
                            className={`${FILTER_BUTTON} ${FILTER_INACTIVE}`}
                          >
                            {updating ? 'Updating…' : 'Reopen'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
