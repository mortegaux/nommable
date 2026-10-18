import { useState, useEffect } from 'react';
import { settingsApi, GeneralSystemSettings } from '@/services/api';
import { BookOpen, Users, Lock, UserCheck, CheckCircle2, AlertCircle, Trash2, MessageSquareShare } from 'lucide-react';

const DEFAULT_GENERAL_SETTINGS: GeneralSystemSettings = {
  sharedRecipes: true,
  showRecipeAuthor: true,
  sharedCollections: true,
  sharedMealPlans: true,
  sharedShoppingLists: true,
  sharedPantry: true,
  sharedBatchCooking: true,
  shareAnonymousFeedback: false,
};

export function DataManagement() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirming, setConfirming] = useState(false);

  const [settings, setSettings] = useState<GeneralSystemSettings>(DEFAULT_GENERAL_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSharingMode, setSavingSharingMode] = useState(false);

  useEffect(() => {
    settingsApi
      .getGeneralSettings()
      .then((res) => {
        setSettings({
          sharedRecipes: res.data.sharedRecipes !== false,
          showRecipeAuthor: res.data.showRecipeAuthor !== false,
          sharedCollections: res.data.sharedCollections !== false,
          sharedMealPlans: res.data.sharedMealPlans !== false,
          sharedShoppingLists: res.data.sharedShoppingLists !== false,
          sharedPantry: res.data.sharedPantry !== false,
          sharedBatchCooking: res.data.sharedBatchCooking !== false,
          shareAnonymousFeedback: Boolean(res.data.shareAnonymousFeedback),
        });
      })
      .catch(() => {})
      .finally(() => setLoadingSettings(false));
  }, []);

  const sharedKeys: Array<
    keyof Omit<GeneralSystemSettings, 'showRecipeAuthor' | 'shareAnonymousFeedback'>
  > = [
    'sharedRecipes',
    'sharedCollections',
    'sharedMealPlans',
    'sharedShoppingLists',
    'sharedPantry',
    'sharedBatchCooking',
  ];

  const enabledCount = sharedKeys.filter((k) => settings[k]).length;
  const anySharedEnabled = enabledCount > 0;
  const allSharedEnabled = enabledCount === sharedKeys.length;

  const handleUpdateSettings = async (
    patch: Partial<GeneralSystemSettings>,
    successMsg: string
  ) => {
    try {
      setSavingSharingMode(true);
      setError('');
      setSuccess('');
      const res = await settingsApi.updateGeneralSettings(patch);
      setSettings({
        sharedRecipes: res.data.sharedRecipes !== false,
        showRecipeAuthor: res.data.showRecipeAuthor !== false,
        sharedCollections: res.data.sharedCollections !== false,
        sharedMealPlans: res.data.sharedMealPlans !== false,
        sharedShoppingLists: res.data.sharedShoppingLists !== false,
        sharedPantry: res.data.sharedPantry !== false,
        sharedBatchCooking: res.data.sharedBatchCooking !== false,
        shareAnonymousFeedback: Boolean(res.data.shareAnonymousFeedback),
      });
      setSuccess(successMsg);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update library sharing settings');
    } finally {
      setSavingSharingMode(false);
    }
  };

  const handleEnableSharedLibrary = () => {
    if (!anySharedEnabled) {
      handleUpdateSettings(
        {
          sharedRecipes: true,
          sharedCollections: true,
          sharedMealPlans: true,
          sharedShoppingLists: true,
          sharedPantry: true,
          sharedBatchCooking: true,
        },
        'Shared Library enabled — selected library elements are now shared across all users.'
      );
    }
  };

  const handleEnablePrivateLibrary = () => {
    handleUpdateSettings(
      {
        sharedRecipes: false,
        sharedCollections: false,
        sharedMealPlans: false,
        sharedShoppingLists: false,
        sharedPantry: false,
        sharedBatchCooking: false,
      },
      'Per-User Private Mode enabled — all library elements are now private to each user.'
    );
  };

  const handleEmptyDatabase = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');
      setConfirming(false);
      await settingsApi.clearData();
      setSuccess('Database emptied successfully.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to empty database');
    } finally {
      setLoading(false);
    }
  };

  const sharingOptions: Array<{
    key: keyof Omit<GeneralSystemSettings, 'showRecipeAuthor' | 'shareAnonymousFeedback'>;
    label: string;
    description: string;
  }> = [
    {
      key: 'sharedRecipes',
      label: 'Shared recipes and tags',
      description: 'All users share the same recipe catalog, categories, and tags.',
    },
    {
      key: 'sharedCollections',
      label: 'Shared collections and favorites',
      description: 'All users share custom recipe collections and a unified Favorites list.',
    },
    {
      key: 'sharedMealPlans',
      label: 'Shared meal plans and templates',
      description: 'All users view and edit the same weekly meal calendar and saved templates.',
    },
    {
      key: 'sharedShoppingLists',
      label: 'Shared shopping lists',
      description: 'All users view, add to, and check off items on the same shopping lists.',
    },
    {
      key: 'sharedPantry',
      label: 'Shared pantry inventory',
      description: 'All users track and update a single shared household pantry.',
    },
    {
      key: 'sharedBatchCooking',
      label: 'Shared batch cooking plans',
      description: 'All users share batch cooking sessions, prep checklists, and stats.',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Data &amp; Catalog Management</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Configure which library elements are shared across users and manage database storage.
        </p>

        {error && (
          <div className="mb-4 flex items-center gap-2 p-3.5 bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium rounded-xl">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 flex items-center gap-2 p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 dark:text-emerald-400 text-xs font-medium rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Library Sharing Mode Card */}
        <div className="border border-border bg-card rounded-2xl p-5 mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                Library Sharing Mode
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose which parts of the library are shared across all users or keep accounts isolated.
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold self-start sm:self-auto ${
                anySharedEnabled
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 dark:text-amber-400 border border-amber-500/20'
              }`}
            >
              {anySharedEnabled ? (
                <>
                  <Users className="w-3.5 h-3.5" />
                  Shared Library ({enabledCount}/{sharedKeys.length} Shared)
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  Per-User Private Mode
                </>
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            {/* Left Card: Shared Library + Granular Options */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                anySharedEnabled
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border bg-background hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <button
                  type="button"
                  disabled={loadingSettings || savingSharingMode}
                  onClick={handleEnableSharedLibrary}
                  className="text-xs font-bold text-foreground flex items-center gap-1.5 text-left"
                >
                  <Users className="w-4 h-4 text-primary" />
                  Shared Library
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={loadingSettings || savingSharingMode}
                    onClick={() =>
                      handleUpdateSettings(
                        {
                          sharedRecipes: !allSharedEnabled,
                          sharedCollections: !allSharedEnabled,
                          sharedMealPlans: !allSharedEnabled,
                          sharedShoppingLists: !allSharedEnabled,
                          sharedPantry: !allSharedEnabled,
                          sharedBatchCooking: !allSharedEnabled,
                        },
                        !allSharedEnabled
                          ? 'All library elements are now shared across all users.'
                          : 'All library elements are now private to each user.'
                      )
                    }
                    className="text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    {allSharedEnabled ? 'Deselect All' : 'Select All'}
                  </button>
                  {anySharedEnabled && (
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Select which library elements are shared across all users in your household or team:
              </p>

              {/* Granular Sharing Checkboxes / Switches */}
              <div className="mt-3 pt-3 border-t border-primary/20 space-y-2.5">
                {sharingOptions.map((opt) => {
                  const isChecked = settings[opt.key];
                  return (
                    <div key={opt.key}>
                      <div className="flex items-start gap-3 select-none">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isChecked}
                          aria-label={opt.label}
                          disabled={loadingSettings || savingSharingMode}
                          onClick={() =>
                            handleUpdateSettings(
                              { [opt.key]: !isChecked },
                              `${opt.label} ${!isChecked ? 'enabled' : 'disabled'}.`
                            )
                          }
                          className={`mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed ${
                            isChecked ? 'bg-primary' : 'bg-muted-foreground/30'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              isChecked ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <div
                          className="cursor-pointer"
                          onClick={() => {
                            if (!loadingSettings && !savingSharingMode) {
                              handleUpdateSettings(
                                { [opt.key]: !isChecked },
                                `${opt.label} ${!isChecked ? 'enabled' : 'disabled'}.`
                              );
                            }
                          }}
                        >
                          <div className="text-xs font-semibold text-foreground">{opt.label}</div>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            {opt.description}
                          </p>
                        </div>
                      </div>

                      {/* Sub-option under Shared recipes and tags: Show creator/author */}
                      {opt.key === 'sharedRecipes' && (
                        <div
                          className={`ml-7 mt-2 pl-3 border-l-2 border-primary/20 ${
                            !settings.sharedRecipes ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2.5 select-none">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={settings.sharedRecipes && settings.showRecipeAuthor}
                              aria-label="Show who added or created each recipe"
                              disabled={
                                !settings.sharedRecipes || loadingSettings || savingSharingMode
                              }
                              onClick={() =>
                                handleUpdateSettings(
                                  { showRecipeAuthor: !settings.showRecipeAuthor },
                                  !settings.showRecipeAuthor
                                    ? 'Recipe creator attribution enabled.'
                                    : 'Recipe creator attribution hidden.'
                                )
                              }
                              className={`mt-0.5 relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed ${
                                settings.sharedRecipes && settings.showRecipeAuthor
                                  ? 'bg-primary'
                                  : 'bg-muted-foreground/30'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                  settings.sharedRecipes && settings.showRecipeAuthor
                                    ? 'translate-x-3'
                                    : 'translate-x-0'
                                }`}
                              />
                            </button>
                            <div
                              className={
                                settings.sharedRecipes ? 'cursor-pointer' : 'cursor-not-allowed'
                              }
                              onClick={() => {
                                if (
                                  settings.sharedRecipes &&
                                  !loadingSettings &&
                                  !savingSharingMode
                                ) {
                                  handleUpdateSettings(
                                    { showRecipeAuthor: !settings.showRecipeAuthor },
                                    !settings.showRecipeAuthor
                                      ? 'Recipe creator attribution enabled.'
                                      : 'Recipe creator attribution hidden.'
                                  );
                                }
                              }}
                            >
                              <div className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                                <UserCheck className="w-3 h-3 text-primary flex-shrink-0" />
                                Show who added or created each recipe
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Card: Per-User Private Mode */}
            <button
              type="button"
              disabled={loadingSettings || savingSharingMode}
              onClick={handleEnablePrivateLibrary}
              className={`h-full text-left p-4 rounded-xl border transition-all flex flex-col justify-start ${
                !anySharedEnabled
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border bg-background hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center justify-between mb-1 w-full">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  Per-User Private Library
                </span>
                {!anySharedEnabled && (
                  <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Each user has a completely isolated account — recipes, collections, favorites, meal plans, shopping lists, pantry items, and batch cooking plans are all private to the user who created them.
              </p>
            </button>
          </div>
        </div>

        {/* Developer Feedback Forwarding Opt-In */}
        <div className="border border-border bg-card rounded-2xl p-5 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <MessageSquareShare className="w-4 h-4 text-primary" />
                Share anonymous feedback with Nommable developers
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When enabled, in-app bug reports and feature requests are forwarded anonymously
                (feedback text, app version, route, viewport, and browser metadata only — no names,
                emails, recipes, or private data). Users are shown an explicit consent notice before
                each submission.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(settings.shareAnonymousFeedback)}
              aria-label="Share anonymous feedback with Nommable developers"
              disabled={loadingSettings || savingSharingMode}
              onClick={() =>
                handleUpdateSettings(
                  { shareAnonymousFeedback: !settings.shareAnonymousFeedback },
                  !settings.shareAnonymousFeedback
                    ? 'Anonymous feedback sharing with Nommable developers enabled.'
                    : 'Anonymous feedback sharing with Nommable developers disabled.'
                )
              }
              className={`mt-0.5 relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed ${
                settings.shareAnonymousFeedback ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.shareAnonymousFeedback ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Danger Zone: Empty Database */}
        <div className="border border-destructive/30 bg-destructive/5 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-destructive flex items-center gap-2 mb-1.5">
            <Trash2 className="w-4 h-4" />
            Empty User Data
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Permanently delete your recipes, meal plans, shopping lists, pantry items, and other
            data. This action cannot be undone.
          </p>
          {confirming && (
            <p className="text-xs font-semibold text-destructive mb-3">
              Are you sure? This will permanently erase all your data.
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleEmptyDatabase}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold bg-destructive text-destructive-foreground rounded-xl hover:bg-destructive/90 transition-all disabled:opacity-50"
            >
              {loading ? 'Emptying...' : confirming ? 'Yes, Empty Database' : 'Empty Database'}
            </button>
            {confirming && (
              <button
                onClick={() => setConfirming(false)}
                className="px-4 py-2 text-xs font-semibold border border-input bg-background text-foreground rounded-xl hover:bg-muted transition-all"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
