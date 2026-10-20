import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { setupApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { SETUP_USERNAME_HINT, validateSetupUsername } from './username-validation';

type WizardStep = 1 | 2 | 3 | 4 | 5;

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 1, label: 'Admin Account' },
  { id: 2, label: 'Email / SMTP' },
  { id: 3, label: 'Library Mode' },
  { id: 4, label: 'AI Features' },
  { id: 5, label: 'Done' },
];

export default function SetupWizardPage() {
  const navigate = useNavigate();
  const { needsSetup, isLoading, setAuthFromSetup } = useAuthStore();

  const [step, setStep] = useState<WizardStep>(1);
  const [completedLocally, setCompletedLocally] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Admin Account
  const [username, setUsername] = useState('admin');
  const [usernameError, setUsernameError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 2: SMTP (Skippable)
  const [smtpSkipped, setSmtpSkipped] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');

  // Step 3: Library Mode & Shared Portions
  const [libraryMode, setLibraryMode] = useState<'shared' | 'private'>('shared');
  const [sharedRecipes, setSharedRecipes] = useState(true);
  const [showRecipeAuthor, setShowRecipeAuthor] = useState(true);
  const [sharedCollections, setSharedCollections] = useState(true);
  const [sharedMealPlans, setSharedMealPlans] = useState(true);
  const [sharedShoppingLists, setSharedShoppingLists] = useState(true);
  const [sharedPantry, setSharedPantry] = useState(true);
  const [sharedBatchCooking, setSharedBatchCooking] = useState(true);

  // Step 4: AI Configuration (Managed AI Credits)
  const [aiEnabled, setAiEnabled] = useState(true);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        Loading...
      </div>
    );
  }

  // Redirect to / when setup has already been completed (unless showing the final Step 5 screen)
  if (!needsSetup && !completedLocally) {
    return <Navigate to="/" replace />;
  }

  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // Same rules the auth layer enforces (Better Auth username() defaults) —
    // catch a bad username here instead of at the final setup step.
    const nameError = validateSetupUsername(username);
    if (nameError) {
      setUsernameError(nameError);
      return;
    }
    setUsernameError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setStep(2);
  };

  const handleStep2Skip = () => {
    setError('');
    setSmtpSkipped(true);
    setStep(3);
  };

  const handleStep2Continue = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSmtpSkipped(!smtpHost.trim());
    setStep(3);
  };

  const handleStep3Next = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStep(4);
  };

  const handleFinishSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    setSubmitting(true);
    try {
      const response = await setupApi.complete({
        admin: {
          username: username.trim(),
          password,
        },
        smtp:
          smtpSkipped || !smtpHost.trim()
            ? { skipped: true }
            : {
                skipped: false,
                host: smtpHost.trim(),
                port: parseInt(smtpPort || '587', 10),
                secure: smtpSecure,
                username: smtpUser.trim(),
                pass: smtpPass,
                fromEmail: smtpFrom.trim() || smtpUser.trim() || 'no-reply@nommable.local',
                enabled: true,
              },
        library: {
          mode: libraryMode,
          sharedRecipes,
          showRecipeAuthor,
          sharedCollections,
          sharedMealPlans,
          sharedShoppingLists,
          sharedPantry,
          sharedBatchCooking,
        },
        ai: {
          enabled: aiEnabled,
          imageProvider: aiEnabled ? 'google' : 'none',
          imageModel: aiEnabled ? 'gemini-2.0-flash' : undefined,
        },
      });

      const { user, token, accessToken } = response.data;
      setCompletedLocally(true);
      setAuthFromSetup(user, token || accessToken);
      setStep(5);
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to complete setup. Please check your inputs and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <img
            src="/logo.png"
            alt="Nommable"
            className="h-14 w-14 rounded-xl shadow-sm mb-3"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Welcome to Nommable
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            First-time server setup — let&apos;s get your kitchen ready in a few quick steps.
          </p>
        </div>

        {/* Step Indicator */}
        <div className="mb-6">
          <ol className="grid grid-cols-5 gap-2">
            {STEPS.map((s) => {
              const isActive = step === s.id;
              const isCompleted = step > s.id;
              return (
                <li
                  key={s.id}
                  className={`flex flex-col items-center rounded-lg px-2 py-2 text-center border transition-colors ${
                    isActive
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : isCompleted
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 dark:text-emerald-300'
                        : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  <span className="text-xs uppercase tracking-wider">Step {s.id}</span>
                  <span className="text-xs mt-0.5 truncate w-full">{s.label}</span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Card */}
        <div className="bg-card text-card-foreground border border-border rounded-xl shadow-sm p-6 sm:p-8">
          {error && (
            <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* STEP 1: ADMIN ACCOUNT */}
          {step === 1 && (
            <form onSubmit={handleStep1Next} className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  1. Create Admin Account
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This is the primary administrator account for your Nommable server.
                </p>
              </div>

              <div>
                <label htmlFor="admin-username" className="block text-sm font-medium text-foreground mb-1">
                  Username
                </label>
                <input
                  id="admin-username"
                  type="text"
                  required
                  minLength={3}
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setUsernameError('');
                  }}
                  placeholder="admin"
                  className="w-full rounded-lg border border-input bg-background px-3.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {usernameError ? (
                  <p className="mt-1 text-sm text-destructive">{usernameError}</p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {SETUP_USERNAME_HINT}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="admin-password" className="block text-sm font-medium text-foreground mb-1">
                  Password <span className="text-xs text-muted-foreground">(minimum 8 characters)</span>
                </label>
                <input
                  id="admin-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-lg border border-input bg-background px-3.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label htmlFor="admin-confirm-password" className="block text-sm font-medium text-foreground mb-1">
                  Confirm Password
                </label>
                <input
                  id="admin-confirm-password"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full rounded-lg border border-input bg-background px-3.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Continue →
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: SMTP (SKIPPABLE) */}
          {step === 2 && (
            <form onSubmit={handleStep2Continue} className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  2. Email / SMTP Settings (Optional)
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Used for emailing user invitations. You can skip this and copy invite links directly, or configure it later in Settings.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="smtp-host" className="block text-sm font-medium text-foreground mb-1">
                    SMTP Host
                  </label>
                  <input
                    id="smtp-host"
                    type="text"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.gmail.com"
                    className="w-full rounded-lg border border-input bg-background px-3.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label htmlFor="smtp-port" className="block text-sm font-medium text-foreground mb-1">
                    Port
                  </label>
                  <input
                    id="smtp-port"
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    placeholder="587"
                    className="w-full rounded-lg border border-input bg-background px-3.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="smtp-user" className="block text-sm font-medium text-foreground mb-1">
                    SMTP Username
                  </label>
                  <input
                    id="smtp-user"
                    type="text"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-input bg-background px-3.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label htmlFor="smtp-pass" className="block text-sm font-medium text-foreground mb-1">
                    SMTP Password
                  </label>
                  <input
                    id="smtp-pass"
                    type="password"
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    placeholder="App password or SMTP secret"
                    className="w-full rounded-lg border border-input bg-background px-3.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div>
                  <label htmlFor="smtp-from" className="block text-sm font-medium text-foreground mb-1">
                    From Email Address
                  </label>
                  <input
                    id="smtp-from"
                    type="email"
                    value={smtpFrom}
                    onChange={(e) => setSmtpFrom(e.target.value)}
                    placeholder="no-reply@yourdomain.com"
                    className="w-full rounded-lg border border-input bg-background px-3.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="pt-5">
                  <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smtpSecure}
                      onChange={(e) => setSmtpSecure(e.target.checked)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                    />
                    <span>Use implicit SSL/TLS (Port 465)</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  ← Back
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleStep2Skip}
                    className="rounded-lg border border-border bg-muted/50 px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    Skip for now
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Save &amp; Continue →
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* STEP 3: LIBRARY MODE & SHARED PORTIONS */}
          {step === 3 && (
            <form onSubmit={handleStep3Next} className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  3. Library Sharing Mode
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose whether users on this server share a household kitchen library or keep separate private libraries. You can change this anytime in Settings → Data Management.
                </p>
              </div>

              <div className="space-y-3">
                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                    libraryMode === 'shared'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="libraryMode"
                    checked={libraryMode === 'shared'}
                    onChange={() => setLibraryMode('shared')}
                    className="mt-1 h-4 w-4 text-primary focus:ring-primary"
                  />
                  <div>
                    <div className="font-medium text-foreground">Shared Household Library</div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Everyone on this server shares recipes, meal plans, shopping lists, and pantry items together. Ideal for families, couples, and households.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                    libraryMode === 'private'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="libraryMode"
                    checked={libraryMode === 'private'}
                    onChange={() => setLibraryMode('private')}
                    className="mt-1 h-4 w-4 text-primary focus:ring-primary"
                  />
                  <div>
                    <div className="font-medium text-foreground">Per-User Private Library</div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Every user has their own isolated recipes, meal plans, shopping lists, and pantry inventory.
                    </p>
                  </div>
                </label>
              </div>

              {libraryMode === 'shared' && (
                <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                  <div className="text-sm font-medium text-foreground">
                    Which parts of the library should be shared?
                  </div>

                  <div className="space-y-2.5">
                    <label className="flex items-start gap-2.5 text-sm text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sharedRecipes}
                        onChange={(e) => setSharedRecipes(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      />
                      <span>
                        <strong>Recipes &amp; Tags</strong> — Shared recipe book across all users
                      </span>
                    </label>

                    {sharedRecipes && (
                      <label className="flex items-start gap-2.5 pl-6 text-sm text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showRecipeAuthor}
                          onChange={(e) => setShowRecipeAuthor(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                        />
                        <span>Show who added or created each recipe</span>
                      </label>
                    )}

                    <label className="flex items-start gap-2.5 text-sm text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sharedCollections}
                        onChange={(e) => setSharedCollections(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      />
                      <span>
                        <strong>Collections &amp; Favorites</strong> — Shared recipe collections and unified Favorites
                      </span>
                    </label>

                    <label className="flex items-start gap-2.5 text-sm text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sharedMealPlans}
                        onChange={(e) => setSharedMealPlans(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      />
                      <span>
                        <strong>Meal Plans &amp; Templates</strong> — Shared household meal calendar
                      </span>
                    </label>

                    <label className="flex items-start gap-2.5 text-sm text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sharedShoppingLists}
                        onChange={(e) => setSharedShoppingLists(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      />
                      <span>
                        <strong>Shopping Lists</strong> — Shared grocery lists and live item check-offs
                      </span>
                    </label>

                    <label className="flex items-start gap-2.5 text-sm text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sharedPantry}
                        onChange={(e) => setSharedPantry(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      />
                      <span>
                        <strong>Pantry Inventory</strong> — Shared household pantry stock and suggestions
                      </span>
                    </label>

                    <label className="flex items-start gap-2.5 text-sm text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sharedBatchCooking}
                        onChange={(e) => setSharedBatchCooking(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      />
                      <span>
                        <strong>Batch Cooking Plans</strong> — Shared prep timelines and sessions
                      </span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Continue →
                </button>
              </div>
            </form>
          )}

          {/* STEP 4: AI FEATURES & FREE TRIAL */}
          {step === 4 && (
            <form onSubmit={handleFinishSetup} className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  4. AI Features & Free Trial
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Do you want to enable AI features like recipe importing, smart meal planning, and AI food photography?
                </p>
              </div>

              {/* AI Enabled Yes/No Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-border p-4">
                <div>
                  <div className="font-medium text-foreground">Enable AI features?</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Powered by managed AI credits. Includes 10 free trial credits out of the box.
                  </p>
                </div>
                <div className="inline-flex rounded-lg border border-border p-1 bg-muted/40">
                  <button
                    type="button"
                    onClick={() => setAiEnabled(true)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      aiEnabled
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiEnabled(false)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      !aiEnabled
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              {aiEnabled && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-foreground space-y-2">
                  <div className="font-medium flex items-center gap-2">
                    <span>⚡</span> Managed AI Enabled (10 Free Trial Credits)
                  </div>
                  <p className="text-xs text-muted-foreground">
                    You&apos;re all set! You get 10 free AI credits instantly to test out recipe generation and photo creation. You can track your balance or add your own custom API key anytime later in Settings.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={submitting}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Completing Setup...' : 'Complete Setup →'}
                </button>
              </div>
            </form>
          )}

          {/* STEP 5: COMPLETION SCREEN */}
          {step === 5 && (
            <div className="text-center py-6 space-y-5">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 dark:text-emerald-400 text-2xl font-bold">
                ✓
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">
                  Your Nommable Server is Ready!
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Admin account <strong>@{username}</strong> has been created and your initial settings are saved.
                </p>
              </div>

              <div className="mx-auto max-w-md rounded-xl border border-border bg-muted/20 p-4 text-left text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Admin Account:</span>
                  <span className="font-medium text-foreground">@{username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email / SMTP:</span>
                  <span className="font-medium text-foreground">
                    {smtpSkipped || !smtpHost.trim() ? 'Skipped (can configure in Settings)' : smtpHost}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Library Mode:</span>
                  <span className="font-medium text-foreground">
                    {libraryMode === 'shared' ? 'Shared Household Library' : 'Per-User Private Library'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">AI Features:</span>
                  <span className="font-medium text-foreground">
                    {aiEnabled ? 'Enabled (Managed AI Credits)' : 'Disabled'}
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => navigate('/recipes', { replace: true })}
                  className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                >
                  Go to dashboard →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
