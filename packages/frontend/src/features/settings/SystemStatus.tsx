import { useState, useEffect, useCallback } from 'react';
import { settingsApi } from '@/services/api';
import { SystemStatus } from '@nommable/shared';
import { formatBytes, formatUptime } from '@/utils/format';
import { AlertCircle, CheckCircle2, RefreshCw, Server } from 'lucide-react';

/**
 * Admin System tab (issue #23) — read-only diagnostics.
 * Release notes render as plain text (pre-wrap), never as HTML/markdown:
 * the notes come from GitHub and must not be able to inject markup.
 * No auto-update: this screen only detects and explains.
 */
export function SystemStatusPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await settingsApi.getSystemStatus();
      setStatus(res.data);
    } catch {
      setError('Failed to load system status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !status) {
    return <p className="text-sm text-muted-foreground">Loading system status…</p>;
  }

  if (error && !status) {
    return (
      <div className="flex items-center gap-2 p-3.5 bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium rounded-xl">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!status) return null;

  const update = status.available;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1 flex items-center gap-2">
          <Server className="w-5 h-5 text-primary" />
          System Status
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Read-only diagnostics. Update checks detect new releases — they never download or
          apply anything automatically.
        </p>
      </div>

      {/* Version + update check */}
      <section className="border border-border bg-card rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Version</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Installed: <span className="font-semibold text-foreground">v{status.installedVersion}</span>
              {update.version && (
                <>
                  {' · '}Available:{' '}
                  <span className="font-semibold text-foreground">{update.version}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {update.updateAvailable ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                <AlertCircle className="w-3.5 h-3.5" />
                Update available
              </span>
            ) : update.status === 'up-to-date' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Up to date
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
                <AlertCircle className="w-3.5 h-3.5" />
                {update.status === 'unavailable' ? 'Couldn’t check for updates' : 'Version unknown'}
              </span>
            )}
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border border-input bg-background hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Check again
            </button>
          </div>
        </div>

        {update.status === 'unavailable' && (
          <p className="text-xs text-muted-foreground">
            The update check couldn’t reach GitHub (offline or rate-limited). The rest of this
            page still works — try again later.
          </p>
        )}

        {update.updateAvailable && update.releaseUrl && (
          <p className="text-xs text-muted-foreground">
            To update, pull the new image in Portainer and redeploy — see{' '}
            <a
              href={update.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              {update.version} release notes
            </a>
            .
          </p>
        )}

        {update.releaseNotes && (
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-2">
              Release notes {update.version ? `(${update.version})` : ''}
            </h4>
            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-background p-4 text-xs leading-relaxed text-foreground">
              {update.releaseNotes}
            </pre>
          </div>
        )}
      </section>

      {/* Health + storage */}
      <section className="border border-border bg-card rounded-2xl p-5">
        <h3 className="text-sm font-bold text-foreground mb-3">Health &amp; Storage</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Uptime</dt>
            <dd className="font-semibold text-foreground">{formatUptime(status.uptimeSeconds)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Database size</dt>
            <dd className="font-semibold text-foreground">{formatBytes(status.database.sizeBytes)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Uploads size</dt>
            <dd className="font-semibold text-foreground">{formatBytes(status.uploads.sizeBytes)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Migrations</dt>
            <dd className="font-semibold text-foreground">
              {status.migrations.status === 'up-to-date'
                ? `Up to date (${status.migrations.applied}/${status.migrations.total})`
                : status.migrations.status === 'pending'
                  ? `${status.migrations.pending} pending`
                  : 'Unknown'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Last backup</dt>
            <dd className="font-semibold text-foreground">
              No backups yet — backup &amp; restore is coming soon.
            </dd>
          </div>
        </dl>
        {status.migrations.pendingNames.length > 0 && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
            Pending migrations: {status.migrations.pendingNames.join(', ')} — restart the
            container to apply them.
          </p>
        )}
      </section>
    </div>
  );
}
