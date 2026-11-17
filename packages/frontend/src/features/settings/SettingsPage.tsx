import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { AccountSettings } from './AccountSettings';
import { UserManagement } from './UserManagement';
import { EmailSettings } from './EmailSettings';
import { DataManagement } from './DataManagement';
import { SystemStatusPage } from './SystemStatus';
import PreferencesPage from '@/features/preferences/PreferencesPage';
import AISettingsPage from '@/features/ai/AISettingsPage';
import UserAIKeySettings from './UserAIKeySettings';

type Tab = 'account' | 'preferences' | 'ai' | 'users' | 'email' | 'data' | 'system';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [searchParams] = useSearchParams();
  // Deep link support: /settings?tab=ai opens the AI tab directly.
  // Used by the AI setup CTA when AI isn't configured yet.
  // ('aikey' is a legacy alias from before the tabs were merged.)
  const rawTab = searchParams.get('tab');
  const initialTab: Tab = rawTab === 'aikey' ? 'ai' : (rawTab as Tab) || 'account';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const tabs = [
    { id: 'account' as Tab, label: 'Account', visible: true },
    { id: 'preferences' as Tab, label: 'Preferences', visible: true },
    { id: 'ai' as Tab, label: 'AI settings', visible: true },
    { id: 'users' as Tab, label: 'User management', visible: isAdmin },
    { id: 'email' as Tab, label: 'Email / SMTP', visible: isAdmin },
    { id: 'data' as Tab, label: 'Data management', visible: isAdmin },
    { id: 'system' as Tab, label: 'System', visible: isAdmin },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <h1 className="text-3xl font-medium leading-tight text-balance mb-6">Settings</h1>

      <div className="bg-card border border-border rounded-lg shadow">
        {/* Tabs */}
        <div className="border-b border-border overflow-x-auto">
          <nav className="flex -mb-px min-w-max">
            {tabs
              .filter((tab) => tab.visible)
              .map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 sm:px-6 py-3 text-sm font-medium border-b transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6">
          {activeTab === 'account' && <AccountSettings />}
          {activeTab === 'preferences' && <PreferencesPage />}
          {activeTab === 'ai' && (
            <div className="space-y-10">
              {isAdmin && (
                <section>
                  <h2 className="mb-4 text-xl font-medium text-foreground">
                    Instance AI settings
                  </h2>
                  <AISettingsPage hideHeader />
                </section>
              )}
              <section>
                <h2 className="mb-4 text-xl font-medium text-foreground">
                  {isAdmin ? 'Your personal AI key' : 'Your AI key'}
                </h2>
                <UserAIKeySettings hideHeader />
              </section>
            </div>
          )}
          {activeTab === 'users' && isAdmin && <UserManagement />}
          {activeTab === 'email' && isAdmin && <EmailSettings />}
          {activeTab === 'data' && isAdmin && <DataManagement />}
          {activeTab === 'system' && isAdmin && <SystemStatusPage />}
        </div>
      </div>
    </div>
  );
}
