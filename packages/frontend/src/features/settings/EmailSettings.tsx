import { useState, useEffect } from 'react';
import { settingsApi, type SmtpSettings } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import {
  Mail,
  Server,
  Lock,
  Send,
  Save,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

interface EmailSettingsProps {
  onSaved?: (settings: SmtpSettings) => void;
  compact?: boolean;
}

interface SmtpPreset {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  hint: string;
}

const SMTP_PRESETS: SmtpPreset[] = [
  {
    id: 'gmail',
    label: 'Gmail / Google Workspace',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    hint: 'Use your full Gmail address as Username and a 16-character Google App Password (from Google Account → Security → 2-Step Verification → App passwords).',
  },
  {
    id: 'outlook',
    label: 'Outlook / Microsoft 365',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    hint: 'Use your full Outlook/M365 email address and password (or App Password if MFA is enabled).',
  },
  {
    id: 'fastmail',
    label: 'Fastmail',
    host: 'smtp.fastmail.com',
    port: 465,
    secure: true,
    hint: 'Create an App Password in Fastmail Settings → Privacy & Security → Integrations with SMTP access enabled.',
  },
  {
    id: 'icloud',
    label: 'iCloud Mail',
    host: 'smtp.mail.me.com',
    port: 587,
    secure: false,
    hint: 'Use your iCloud email address and an App-Specific Password generated at appleid.apple.com.',
  },
  {
    id: 'mailgun',
    label: 'Mailgun / SendGrid / SES',
    host: 'smtp.mailgun.org',
    port: 587,
    secure: false,
    hint: 'Replace host with your transactional provider (e.g., smtp.sendgrid.net or email-smtp.us-east-1.amazonaws.com) and enter your SMTP credentials.',
  },
];

export function EmailSettings({ onSaved, compact = false }: EmailSettingsProps) {
  const currentUser = useAuthStore((state) => state.user);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [host, setHost] = useState('');
  const [port, setPort] = useState<number>(587);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fromEmail, setFromEmail] = useState('noreply@nommable.local');
  const [fromName, setFromName] = useState('Nommable');
  const [enabled, setEnabled] = useState(true);
  const [source, setSource] = useState<'database' | 'env' | 'unconfigured'>('unconfigured');
  const [isConfigured, setIsConfigured] = useState(false);

  const [selectedPresetHint, setSelectedPresetHint] = useState<string | null>(null);
  const [testRecipient, setTestRecipient] = useState(currentUser?.email || '');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (currentUser?.email && !testRecipient) {
      setTestRecipient(currentUser.email);
    }
  }, [currentUser?.email, testRecipient]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const res = await settingsApi.getSmtpSettings();
      applySettingsState(res.data);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.error || 'Failed to load SMTP settings',
      });
    } finally {
      setLoading(false);
    }
  };

  const applySettingsState = (data: SmtpSettings) => {
    setHost(data.host || '');
    setPort(data.port || 587);
    setSecure(Boolean(data.secure));
    setUser(data.user || '');
    setPass('');
    setHasSavedPassword(Boolean(data.hasPassword));
    setClearPassword(false);
    setFromEmail(data.fromEmail || 'noreply@nommable.local');
    setFromName(data.fromName || 'Nommable');
    setEnabled(data.enabled !== false);
    setSource(data.source);
    setIsConfigured(Boolean(data.isConfigured));
  };

  const handleApplyPreset = (preset: SmtpPreset) => {
    setHost(preset.host);
    setPort(preset.port);
    setSecure(preset.secure);
    setEnabled(true);
    setSelectedPresetHint(preset.hint);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    try {
      setSaving(true);
      const res = await settingsApi.saveSmtpSettings({
        host: host.trim(),
        port: Number(port) || 587,
        secure,
        user: user.trim(),
        pass: pass.trim() ? pass : undefined,
        clearPassword,
        fromEmail: fromEmail.trim() || user.trim() || 'noreply@nommable.local',
        fromName: fromName.trim() || 'Nommable',
        enabled,
      });

      applySettingsState(res.data);
      setFeedback({
        type: 'success',
        text: res.data.isConfigured
          ? 'SMTP settings saved and active! Invitation emails will now be sent automatically.'
          : 'SMTP settings saved.',
      });
      if (onSaved) {
        onSaved(res.data);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.error || 'Failed to save SMTP settings',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!host.trim()) {
      setFeedback({ type: 'error', text: 'Please enter an SMTP host before testing.' });
      return;
    }
    if (!testRecipient.trim()) {
      setFeedback({ type: 'error', text: 'Please enter a recipient email address for the test.' });
      return;
    }

    setFeedback(null);
    try {
      setTesting(true);
      const res = await settingsApi.testSmtpSettings({
        host: host.trim(),
        port: Number(port) || 587,
        secure,
        user: user.trim(),
        pass: pass.trim() ? pass : undefined,
        fromEmail: fromEmail.trim() || user.trim() || 'noreply@nommable.local',
        fromName: fromName.trim() || 'Nommable',
        toEmail: testRecipient.trim(),
      });

      setFeedback({
        type: res.data.success ? 'success' : 'error',
        text: res.data.message,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.error || 'Failed to send test email',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading SMTP settings...
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      {/* Header & Status Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className={`${compact ? 'text-base' : 'text-xl'} font-bold text-foreground flex items-center gap-2`}>
            <Mail className="w-5 h-5 text-primary" />
            Email &amp; SMTP Configuration
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure outbound SMTP to automatically send user invitation emails.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isConfigured ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              SMTP Configured ({source === 'env' ? 'Environment' : 'Database'})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 dark:text-amber-400 border border-amber-500/20">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              SMTP Not Configured
            </span>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-xs leading-relaxed ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300 dark:text-emerald-400'
              : 'bg-destructive/10 border-destructive/20 text-destructive'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Quick Provider Presets */}
      <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          Quick Provider Presets
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SMTP_PRESETS.map((preset) => {
            const isSelected = host === preset.host && port === preset.port;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background text-foreground border-input hover:bg-muted'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        {selectedPresetHint && (
          <p className="text-[11px] text-muted-foreground bg-background/80 p-2.5 rounded-lg border border-border/60">
            {selectedPresetHint}
          </p>
        )}
      </div>

      {/* Main SMTP Form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="sm:col-span-2">
            <label htmlFor="smtp-host" className="block text-xs font-semibold text-foreground mb-1">
              SMTP Host <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Server className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                id="smtp-host"
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp.gmail.com"
                className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label htmlFor="smtp-port" className="block text-xs font-semibold text-foreground mb-1">
              SMTP Port <span className="text-destructive">*</span>
            </label>
            <input
              id="smtp-port"
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => {
                const nextPort = Number(e.target.value);
                setPort(nextPort);
                if (nextPort === 465) setSecure(true);
                else if (nextPort === 587 || nextPort === 25) setSecure(false);
              }}
              placeholder="587"
              className="w-full text-xs px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Encryption Mode & Enable Toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label htmlFor="smtp-security" className="block text-xs font-semibold text-foreground mb-1">
              Encryption / TLS Mode
            </label>
            <select
              id="smtp-security"
              value={secure ? 'tls' : 'starttls'}
              onChange={(e) => {
                const useImplicitTls = e.target.value === 'tls';
                setSecure(useImplicitTls);
                if (useImplicitTls && port === 587) setPort(465);
                if (!useImplicitTls && port === 465) setPort(587);
              }}
              className="w-full text-xs px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="starttls">STARTTLS / Explicit TLS (Port 587 / 25 — Recommended)</option>
              <option value="tls">Implicit SSL/TLS (Port 465)</option>
            </select>
          </div>

          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-input text-primary focus:ring-primary"
              />
              <span className="text-xs font-medium text-foreground">
                Enable automatic email delivery via SMTP
              </span>
            </label>
          </div>
        </div>

        {/* Credentials */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label htmlFor="smtp-user" className="block text-xs font-semibold text-foreground mb-1">
              SMTP Username
            </label>
            <input
              id="smtp-user"
              type="text"
              value={user}
              onChange={(e) => {
                const nextUser = e.target.value;
                setUser(nextUser);
                if (
                  nextUser.includes('@') &&
                  (!fromEmail || fromEmail === 'noreply@nommable.local')
                ) {
                  setFromEmail(nextUser);
                }
              }}
              placeholder="you@example.com"
              autoComplete="off"
              className="w-full text-xs px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="smtp-pass" className="block text-xs font-semibold text-foreground">
                SMTP Password / App Password
              </label>
              {hasSavedPassword && !clearPassword && (
                <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 dark:text-emerald-400">
                  Saved in database (encrypted)
                </span>
              )}
            </div>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                id="smtp-pass"
                type={showPassword ? 'text' : 'password'}
                value={pass}
                onChange={(e) => {
                  setPass(e.target.value);
                  if (e.target.value) setClearPassword(false);
                }}
                placeholder={
                  hasSavedPassword && !clearPassword
                    ? '•••••••••••••••• (leave blank to keep existing)'
                    : 'Enter SMTP password or app password'
                }
                autoComplete="new-password"
                className="w-full text-xs pl-8 pr-9 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Sender Identity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label htmlFor="smtp-from-email" className="block text-xs font-semibold text-foreground mb-1">
              From Email Address
            </label>
            <input
              id="smtp-from-email"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="noreply@yourdomain.com"
              className="w-full text-xs px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              For Gmail/iCloud/Outlook, this should match your SMTP Username.
            </p>
          </div>

          <div>
            <label htmlFor="smtp-from-name" className="block text-xs font-semibold text-foreground mb-1">
              From Display Name
            </label>
            <input
              id="smtp-from-name"
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Nommable"
              className="w-full text-xs px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Test SMTP Section */}
        <div className="p-3.5 rounded-xl border border-border bg-card/60 space-y-2.5">
          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5 text-primary" />
            Send a Test Email
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              placeholder="Recipient email for test (e.g. you@example.com)"
              className="flex-1 text-xs px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              disabled={testing || !host.trim()}
              onClick={handleSendTestEmail}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-input bg-background hover:bg-muted text-foreground transition-all disabled:opacity-50 whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              {testing ? 'Sending Test...' : 'Send Test Email'}
            </button>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save SMTP Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
