import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bug, Lightbulb, ShieldCheck } from 'lucide-react';
import { Dialog } from '@/components/Dialog';
import { UpdateBanner } from '@/components/UpdateBanner';
import { feedbackApi, settingsApi, type CreateFeedbackDto, type FeedbackType } from '@/services/api';
import { useToastStore } from '@/store/toast.store';
import { version as appVersion } from '../../package.json';

// NOTE: FeedbackType / CreateFeedbackDto are minimal local definitions in
// services/api.ts until the shared feedback types land in @nommable/shared.

const TYPE_OPTIONS: { value: FeedbackType; label: string; Icon: typeof Bug }[] = [
  { value: 'bug', label: 'Bug', Icon: Bug },
  { value: 'feature', label: 'Feature request', Icon: Lightbulb },
];

/**
 * Small floating feedback button (bottom-right) that opens a bug report /
 * feature request dialog. Mounted once in DashboardLayout so it's on every page.
 */
export function FeedbackWidget() {
  const location = useLocation();
  const toast = useToastStore();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('bug');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [shareAnonymousFeedback, setShareAnonymousFeedback] = useState(false);

  useEffect(() => {
    if (!open) return;
    settingsApi
      .getGeneralSettings()
      .then((res) => {
        setShareAnonymousFeedback(Boolean(res.data?.shareAnonymousFeedback));
      })
      .catch(() => {
        setShareAnonymousFeedback(false);
      });
  }, [open]);

  const resetForm = () => {
    setType('bug');
    setSummary('');
    setDetails('');
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim() || submitting) return;

    setSubmitting(true);
    const payload: CreateFeedbackDto = {
      type,
      summary: summary.trim(),
      details: details.trim() || undefined,
      route: location.pathname,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      appVersion,
    };

    try {
      await feedbackApi.submit(payload);
      toast.success('Thanks! Your feedback has been sent.');
      handleClose();
      resetForm();
    } catch {
      toast.error('Failed to send feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <UpdateBanner />
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Report a bug or request a feature"
        aria-label="Report a bug or request a feature"
        className="fixed bottom-4 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-colors hover:text-foreground hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <Bug className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <Dialog
          title="Report a bug / Request a feature"
          onClose={handleClose}
          panelClassName="max-w-md"
        >
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            {/* Type selector */}
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-foreground">Type</legend>
              <div className="flex gap-2">
                {TYPE_OPTIONS.map(({ value, label, Icon }) => (
                  <label
                    key={value}
                    className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      type === value
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <input
                      type="radio"
                      name="feedback-type"
                      value={value}
                      checked={type === value}
                      onChange={() => setType(value)}
                      className="sr-only"
                    />
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Summary */}
            <div>
              <label htmlFor="feedback-summary" className="mb-1 block text-sm font-medium text-foreground">
                Summary <span aria-hidden="true">*</span>
              </label>
              <input
                id="feedback-summary"
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="e.g. Shopping list items disappear on refresh"
                maxLength={200}
                required
                autoFocus
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Details */}
            <div>
              <label htmlFor="feedback-details" className="mb-1 block text-sm font-medium text-foreground">
                Details <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="feedback-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="What happened? What did you expect?"
                rows={4}
                className="w-full resize-y rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Explicit consent notice when developer forwarding is enabled */}
            {shareAnonymousFeedback && (
              <div
                role="note"
                className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground"
              >
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  This will send an anonymized report to the Nommable team. No names, emails,
                  recipes, or private data are included.
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="rounded-lg border border-border bg-background px-6 py-2 text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !summary.trim()}
                className="rounded-lg bg-primary px-6 py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
