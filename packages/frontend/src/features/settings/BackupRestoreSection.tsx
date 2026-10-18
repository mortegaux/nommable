import { useEffect, useRef, useState } from 'react';
import { settingsApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import type { BackupPreview, EntityCounts } from '@nommable/shared';
import { Callout } from '@/components/Callout';
import { Download, Upload, Database, AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * Backup & Restore section (issue #71) — the UI for the #16 backup API.
 *
 * Rendered inside DataManagement (Settings → Data Management), which
 * SettingsPage only shows to admins — but this component also refuses
 * non-admins itself, so it is safe to render standalone.
 *
 * Flow:
 * - Export: GET /settings/backup/export → blob download (filename from
 *   Content-Disposition, e.g. nommable-backup-<ts>.zip).
 * - Restore: upload a .zip → POST /settings/backup/restore/preview →
 *   preview (manifest + counts + validation) → explicit checkbox +
 *   confirm → POST /settings/backup/restore/confirm { token, confirmed: true }.
 *   The server takes a safety backup of the current data before swapping.
 *
 * There is intentionally NO backup list here: the API has no list
 * endpoint (safety backups live on disk under <dataDir>/backups/).
 * Listing them needs a backend GET /backup/list endpoint — follow-up.
 */

const COUNT_LABELS: Array<[keyof EntityCounts, string]> = [
  ['recipes', 'Recipes'],
  ['images', 'Images'],
  ['users', 'Users'],
  ['mealPlans', 'Meal Plans'],
  ['shoppingLists', 'Shopping Lists'],
  ['pantryItems', 'Pantry Items'],
  ['batchPlans', 'Batch Plans'],
];

function filenameFromDisposition(header: string | undefined): string {
  const match = header?.match(/filename="([^"]+)"/);
  if (match?.[1]) return match[1];
  return `nommable-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupRestoreSection() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [lastRestoreAt, setLastRestoreAt] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportSuccess, setExportSuccess] = useState('');

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [restoreDone, setRestoreDone] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Best-effort: show when the last backup / restore happened.
    settingsApi
      .getSystemStatus()
      .then((res) => {
        setLastBackupAt(res.data.lastBackup.at);
        setLastRestoreAt(res.data.lastBackup.lastRestoreAt);
      })
      .catch(() => {});
  }, []);

  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground">Only admins can manage backups.</p>;
  }

  const handleExport = async () => {
    setExportError('');
    setExportSuccess('');
    setExporting(true);
    try {
      const res = await settingsApi.exportBackup();
      const blob = res.data as unknown as Blob;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filenameFromDisposition(res.headers?.['content-disposition']);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportSuccess('Backup downloaded.');
      setLastBackupAt(new Date().toISOString());
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to export backup.';
      setExportError(message);
    } finally {
      setExporting(false);
    }
  };

  const handleSelectFile = (file: File | null) => {
    setRestoreFile(file);
    setPreview(null);
    setPreviewError('');
    setConfirmChecked(false);
    setConfirmError('');
    setRestoreDone(false);
  };

  const handlePreview = async () => {
    if (!restoreFile) return;
    setPreviewError('');
    setPreview(null);
    setPreviewing(true);
    try {
      const formData = new FormData();
      formData.append('archive', restoreFile);
      const res = await settingsApi.previewRestore(formData);
      setPreview(res.data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to preview backup. Is it a valid Nommable backup (.zip)?';
      setPreviewError(message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!preview || !confirmChecked) return;
    setConfirmError('');
    setConfirming(true);
    try {
      await settingsApi.confirmRestore(preview.token);
      setRestoreDone(true);
      setPreview(null);
      setRestoreFile(null);
      setConfirmChecked(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to apply restore. The preview may have expired — upload the backup and preview it again.';
      setConfirmError(message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div id="backup" className="border border-border bg-card rounded-2xl p-5 mb-6 scroll-mt-4">
      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
        <Database className="w-4 h-4 text-primary" />
        Backup &amp; Restore
      </h3>
      <p className="text-xs text-muted-foreground mt-0.5 mb-4">
        A backup contains the full database (recipes, pantry, meal plans, shopping lists,
        users) plus uploaded images. Before a restore is applied, the server takes a safety
        backup of the current data.
      </p>

      {(lastBackupAt || lastRestoreAt) && (
        <p className="text-xs text-muted-foreground mb-4">
          {lastBackupAt && (
            <>
              Last backup: {new Date(lastBackupAt).toLocaleString()}
              <br />
            </>
          )}
          {lastRestoreAt && <>Last restore: {new Date(lastRestoreAt).toLocaleString()}</>}
        </p>
      )}

      {/* Export */}
      <div className="mb-5">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Exporting…' : 'Download Backup'}
        </button>
        {exportError && (
          <div className="mt-3">
            <Callout tone="error" role="alert">
              {exportError}
            </Callout>
          </div>
        )}
        {exportSuccess && (
          <div className="mt-3">
            <Callout tone="success">{exportSuccess}</Callout>
          </div>
        )}
      </div>

      {/* Restore */}
      <div className="border-t border-border pt-4">
        <h4 className="text-xs font-bold text-foreground flex items-center gap-2 mb-2">
          <Upload className="w-4 h-4 text-primary" />
          Restore from a backup
        </h4>
        <p className="text-xs text-muted-foreground mb-3">
          Upload a backup archive (.zip). Nothing is changed until you preview it and
          explicitly confirm the restore.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            aria-label="Backup archive (.zip)"
            onChange={(e) => handleSelectFile(e.target.files?.[0] ?? null)}
            className="text-xs text-foreground file:mr-3 file:px-3 file:py-2 file:text-xs file:font-semibold file:bg-muted file:text-foreground file:rounded-lg file:border file:border-input hover:file:bg-muted/80"
          />
          <button
            type="button"
            onClick={handlePreview}
            disabled={!restoreFile || previewing}
            className="px-4 py-2 text-xs font-semibold border border-input bg-background text-foreground rounded-xl hover:bg-muted transition-all disabled:opacity-50 shrink-0"
          >
            {previewing ? 'Previewing…' : 'Preview Restore'}
          </button>
        </div>

        {previewError && (
          <div className="mt-3">
            <Callout tone="error" role="alert">
              {previewError}
            </Callout>
          </div>
        )}

        {preview && (
          <div className="mt-4 space-y-3">
            <Callout tone="info" title="Backup preview">
              <dl className="space-y-1">
                <div className="flex justify-between gap-4">
                  <dt>Created</dt>
                  <dd className="font-semibold">
                    {new Date(preview.manifest.createdAt).toLocaleString()}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>App version</dt>
                  <dd className="font-semibold">{preview.manifest.appVersion}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Format version</dt>
                  <dd className="font-semibold">{preview.manifest.formatVersion}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Archive size</dt>
                  <dd className="font-semibold">{formatBytes(preview.archiveSizeBytes)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Upload files</dt>
                  <dd className="font-semibold">{preview.manifest.uploadFileCount}</dd>
                </div>
              </dl>
              <div className="mt-3">
                <p className="font-semibold mb-1">Contents (verified against the backup database):</p>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
                  {COUNT_LABELS.map(([key, label]) => (
                    <div key={key} className="flex justify-between gap-2">
                      <dt>{label}</dt>
                      <dd className="font-semibold">{preview.counts[key]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <p className="mt-2 text-xs">
                Preview expires {new Date(preview.expiresAt).toLocaleString()}.
              </p>
            </Callout>

            {preview.validation.warnings.length > 0 && (
              <Callout tone="warning" title="Warnings">
                <ul className="list-disc pl-4 space-y-0.5">
                  {preview.validation.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Callout>
            )}

            {!preview.validation.valid ? (
              <Callout tone="error" role="alert" title="This backup failed validation">
                <ul className="list-disc pl-4 space-y-0.5">
                  {preview.validation.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
                <p className="mt-2">
                  The restore cannot be applied. Choose a different backup archive.
                </p>
              </Callout>
            ) : (
              <>
                <Callout tone="warning" title="Restore replaces all current data">
                  Restoring will replace the current database and uploads with this
                  backup&apos;s contents. The server takes a safety backup of the current
                  data first, and then restarts on the restored data.
                </Callout>
                <label className="flex items-start gap-2 text-xs font-medium text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmChecked}
                    onChange={(e) => setConfirmChecked(e.target.checked)}
                    className="mt-0.5"
                  />
                  I understand this will replace all current data with the backup&apos;s
                  contents.
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmRestore}
                    disabled={!confirmChecked || confirming}
                    className="px-4 py-2 text-xs font-semibold bg-destructive text-destructive-foreground rounded-xl hover:bg-destructive/90 transition-all disabled:opacity-50"
                  >
                    {confirming ? 'Restoring…' : 'Restore Backup'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreview(null);
                      setRestoreFile(null);
                      setConfirmChecked(false);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="px-4 py-2 text-xs font-semibold border border-input bg-background text-foreground rounded-xl hover:bg-muted transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {confirmError && (
          <div className="mt-3">
            <Callout tone="error" role="alert">
              {confirmError}
            </Callout>
          </div>
        )}

        {restoreDone && (
          <div className="mt-3">
            <Callout tone="success" title="Restore applied">
              <p className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  The server is restarting on the restored data. Wait a few seconds,
                  then reload the page.
                </span>
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all"
              >
                Reload Page
              </button>
            </Callout>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-4 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>
          Safety backups taken before a restore are kept on the server. Listing and
          downloading them from the UI needs a backup-list API endpoint (follow-up).
        </span>
      </p>
    </div>
  );
}
