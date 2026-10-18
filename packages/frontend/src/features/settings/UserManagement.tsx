import { useState, useEffect, useMemo } from 'react';
import { invitationApi, userApi, settingsApi, type SmtpSettings } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { useConfirmStore } from '@/store/confirm.store';
import { EmailSettings } from './EmailSettings';
import type { User, UserRole, UserInvitationResponse } from '@nommable/shared';
import {
  Users,
  UserPlus,
  Mail,
  MailPlus,
  Shield,
  ShieldCheck,
  Copy,
  Check,
  Trash2,
  KeyRound,
  RotateCw,
  Search,
  AlertCircle,
  CheckCircle2,
  Clock,
  Lock,
  X,
  UserCheck,
  Settings,
} from 'lucide-react';

export function UserManagement() {
  const currentUser = useAuthStore((state) => state.user);
  const confirm = useConfirmStore((s) => s.confirm);

  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<UserInvitationResponse[]>([]);
  const [smtpSettings, setSmtpSettings] = useState<SmtpSettings | null>(null);
  const [sharedRecipes, setSharedRecipes] = useState<boolean>(true);
  const [showRecipeAuthor, setShowRecipeAuthor] = useState<boolean>(true);
  const [togglingSharedRecipes, setTogglingSharedRecipes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'invitations'>('users');

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');

  // Modals
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSmtpModal, setShowSmtpModal] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<User | null>(null);
  const [resetPasswordTargetUser, setResetPasswordTargetUser] = useState<User | null>(null);

  // Invite modal state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [createdInviteResult, setCreatedInviteResult] = useState<UserInvitationResponse | null>(null);

  // Create user modal state
  const [createEmail, setCreateEmail] = useState('');
  const [createFirstName, setCreateFirstName] = useState('');
  const [createLastName, setCreateLastName] = useState('');
  const [createUsername, setCreateUsername] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('user' as UserRole);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [creatingUser, setCreatingUser] = useState(false);
  const [createdUserPassword, setCreatedUserPassword] = useState<string | null>(null);

  // Reset password modal state
  const [customResetPassword, setCustomResetPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [revealedResetPassword, setRevealedResetPassword] = useState<string | null>(null);

  // Clipboard copy state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Toast / notification
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2500);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersRes, invRes, smtpRes, generalRes] = await Promise.all([
        userApi.getAll(),
        invitationApi.getAll(),
        settingsApi.getSmtpSettings().catch(() => null),
        settingsApi.getGeneralSettings().catch(() => null),
      ]);
      setUsers(usersRes.data.users);
      setInvitations(invRes.data);
      if (smtpRes?.data) {
        setSmtpSettings(smtpRes.data);
      }
      if (generalRes?.data) {
        setSharedRecipes(generalRes.data.sharedRecipes !== false);
        setShowRecipeAuthor(generalRes.data.showRecipeAuthor !== false);
      }
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to load user management data');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSharedRecipes = async () => {
    try {
      setTogglingSharedRecipes(true);
      const nextVal = !sharedRecipes;
      const res = await settingsApi.updateGeneralSettings({ sharedRecipes: nextVal });
      setSharedRecipes(res.data.sharedRecipes);
      setShowRecipeAuthor(res.data.showRecipeAuthor !== false);
      showToast(
        'success',
        res.data.sharedRecipes
          ? 'Shared Recipe Catalog enabled: all users now share the same recipe database.'
          : 'Per-User Recipes enabled: each user now only sees their own recipes.'
      );
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to update recipe sharing mode');
    } finally {
      setTogglingSharedRecipes(false);
    }
  };

  const handleToggleShowRecipeAuthor = async () => {
    try {
      setTogglingSharedRecipes(true);
      const nextVal = !showRecipeAuthor;
      const res = await settingsApi.updateGeneralSettings({ showRecipeAuthor: nextVal });
      setShowRecipeAuthor(res.data.showRecipeAuthor !== false);
      showToast(
        'success',
        res.data.showRecipeAuthor
          ? 'Recipe creator attribution enabled: recipes now display who added or created them.'
          : 'Recipe creator attribution hidden: recipes will no longer display author names.'
      );
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to update recipe author display');
    } finally {
      setTogglingSharedRecipes(false);
    }
  };

  // Live username suggestions when names change
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (createFirstName.trim() && createLastName.trim()) {
        try {
          const res = await userApi.getUsernameSuggestions(createFirstName, createLastName);
          setUsernameSuggestions(res.data.suggestions);
          if (!createUsername && res.data.suggestions.length > 0) {
            setCreateUsername(res.data.suggestions[0]);
          }
        } catch {
          // Non-critical
        }
      }
    };

    const timer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timer);
  }, [createFirstName, createLastName, createUsername]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const query = searchQuery.toLowerCase().trim();
      if (!query) return matchesRole;

      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
      const matchesSearch =
        u.username.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        fullName.includes(query);

      return matchesRole && matchesSearch;
    });
  }, [users, roleFilter, searchQuery]);

  // Statistics
  const adminCount = useMemo(() => users.filter((u) => u.role === 'admin').length, [users]);
  const memberCount = useMemo(() => users.filter((u) => u.role === 'user').length, [users]);

  // Handlers
  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    try {
      setSendingInvite(true);
      const res = await invitationApi.create({
        email: inviteEmail.trim(),
        role: inviteRole,
      });

      setCreatedInviteResult(res.data);
      setInviteEmail('');
      setInviteRole('user');
      loadData();
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to send invitation');
    } finally {
      setSendingInvite(false);
    }
  };

  const handleResendInvitation = async (invitation: UserInvitationResponse) => {
    try {
      const res = await invitationApi.resend(invitation.id);
      showToast('success', res.data.emailStatus || 'Invitation refreshed successfully');
      loadData();
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to resend invitation');
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    try {
      await invitationApi.revoke(invitationId);
      showToast('success', 'Invitation revoked');
      loadData();
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to revoke invitation');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createEmail || !createFirstName || !createLastName || !createUsername) {
      showToast('error', 'Please fill in all required fields');
      return;
    }

    try {
      setCreatingUser(true);
      const res = await userApi.create({
        email: createEmail.trim(),
        username: createUsername.trim(),
        firstName: createFirstName.trim(),
        lastName: createLastName.trim(),
        role: createRole,
      });

      setCreatedUserPassword(res.data.generatedPassword);
      setCreateEmail('');
      setCreateFirstName('');
      setCreateLastName('');
      setCreateUsername('');
      setUsernameSuggestions([]);
      setCreateRole('user' as UserRole);
      loadData();
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleRoleChange = async (targetUser: User, newRole: UserRole) => {
    if (targetUser.role === newRole) return;

    const promoting = newRole === 'admin';
    const ok = await confirm({
      title: 'Change role?',
      message: promoting
        ? `Make ${targetUser.email} an admin? They will gain full access.`
        : `Make ${targetUser.email} a member? They will lose administrator access.`,
      confirmLabel: 'Change role',
    });
    if (!ok) {
      // Snap the controlled select back to the unchanged role
      loadData();
      return;
    }

    try {
      await userApi.updateRole(targetUser.id, newRole);
      showToast('success', `Role for ${targetUser.username} updated to ${newRole}`);
      loadData();
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to update user role');
    }
  };

  const handleExecuteDelete = async () => {
    if (!deleteTargetUser) return;

    try {
      await userApi.delete(deleteTargetUser.id);
      showToast('success', `User ${deleteTargetUser.username} deleted`);
      setDeleteTargetUser(null);
      loadData();
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleExecuteResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordTargetUser) return;

    try {
      setResettingPassword(true);
      const res = await userApi.resetPassword(
        resetPasswordTargetUser.id,
        customResetPassword.trim() || undefined
      );
      setRevealedResetPassword(res.data.temporaryPassword);
      setCustomResetPassword('');
      showToast('success', 'Password reset successfully');
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border text-sm font-medium transition-all shadow-sm ${
            toastMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300 dark:text-emerald-400'
              : 'bg-destructive/10 border-destructive/20 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            User Management
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage user accounts, roles, access permissions, and pending invitations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              setCreatedInviteResult(null);
              setShowInviteModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
          >
            <MailPlus className="w-4 h-4" />
            Invite User
          </button>

          <button
            onClick={() => {
              setCreatedUserPassword(null);
              setShowCreateModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-all shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Add User Directly
          </button>

          <button
            onClick={() => setShowSmtpModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-all shadow-sm"
            title={
              smtpSettings?.isConfigured
                ? `SMTP configured (${smtpSettings.host})`
                : 'SMTP not configured — click to set up email delivery'
            }
          >
            <Settings className="w-4 h-4" />
            <span>SMTP Settings</span>
            <span
              className={`w-2 h-2 rounded-full ${
                smtpSettings?.isConfigured ? 'bg-emerald-600' : 'bg-amber-600'
              }`}
            />
          </button>

          <button
            type="button"
            disabled={togglingSharedRecipes}
            onClick={handleToggleSharedRecipes}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-all shadow-sm disabled:opacity-50"
            title={
              sharedRecipes
                ? 'All users currently share the same recipe database. Click to switch to Per-User Private Recipes.'
                : 'Each user currently has private recipes. Click to enable Shared Recipe Catalog for all users.'
            }
          >
            <Users className="w-4 h-4" />
            <span>{sharedRecipes ? 'Shared Recipes: ON' : 'Shared Recipes: OFF'}</span>
            <span
              className={`w-2 h-2 rounded-full ${
                sharedRecipes ? 'bg-emerald-600' : 'bg-amber-600'
              }`}
            />
          </button>

          {sharedRecipes && (
            <button
              type="button"
              disabled={togglingSharedRecipes}
              onClick={handleToggleShowRecipeAuthor}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-all shadow-sm disabled:opacity-50"
              title={
                showRecipeAuthor
                  ? 'Recipe cards and detail views currently show who created each recipe. Click to hide author attribution.'
                  : 'Recipe creator attribution is hidden. Click to show who created each recipe.'
              }
            >
              <UserCheck className="w-4 h-4" />
              <span>{showRecipeAuthor ? 'Show Author: ON' : 'Show Author: OFF'}</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  showRecipeAuthor ? 'bg-emerald-600' : 'bg-muted-foreground/40'
                }`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-card/60">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Total Users</span>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">{users.length}</div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card/60">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Administrators</span>
            <Shield className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 dark:text-purple-400">{adminCount}</div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card/60">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Members</span>
            <UserCheck className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 dark:text-blue-400">{memberCount}</div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card/60">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Pending Invites</span>
            <Mail className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 dark:text-amber-400">{invitations.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'users'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Active Users ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'invitations'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Pending Invitations ({invitations.length})
          </button>
        </div>
      </div>

      {/* TAB 1: USERS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <label htmlFor="user-search" className="sr-only">
                Search users by name, username, or email
              </label>
              <input
                id="user-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, username, email..."
                className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label htmlFor="role-filter" className="text-xs text-muted-foreground whitespace-nowrap">Filter Role:</label>
              <select
                id="role-filter"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="text-xs rounded-xl border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Roles</option>
                <option value="admin">Administrators</option>
                <option value="user">Members</option>
              </select>
            </div>
          </div>

          {/* Users Table */}
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-border text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs font-medium">No users match your search criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="min-w-full divide-y divide-border text-left">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {filteredUsers.map((user) => {
                    const isSelf = user.id === currentUser?.id;
                    const isRoot = Boolean(user.isSystemAdmin);
                    const isOnlyAdmin = user.role === 'admin' && adminCount <= 1;

                    // Initials for avatar
                    const initials =
                      user.firstName && user.lastName
                        ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
                        : user.username.slice(0, 2).toUpperCase();

                    return (
                      <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs flex-shrink-0">
                              {user.profilePhotoUrl ? (
                                <img
                                  src={user.profilePhotoUrl}
                                  alt={user.username}
                                  className="w-full h-full object-cover rounded-full"
                                />
                              ) : (
                                initials
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-foreground flex items-center gap-1.5">
                                {user.firstName || user.lastName
                                  ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                                  : user.username}

                                {isRoot && (
                                  <span
                                    title="System Administrator (Permanent root account)"
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 dark:text-amber-400 border border-amber-500/20"
                                  >
                                    <ShieldCheck className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                    System Admin
                                  </span>
                                )}

                                {isSelf && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-muted-foreground text-[11px]">@{user.username}</div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {user.email}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          {isRoot ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 dark:text-purple-400 border border-purple-500/20">
                              <Shield className="w-3 h-3" />
                              Admin
                            </span>
                          ) : (
                            <>
                              <label htmlFor={`role-select-${user.id}`} className="sr-only">
                                Change role for {user.email}
                              </label>
                              <select
                                id={`role-select-${user.id}`}
                                value={user.role}
                                disabled={isSelf || isOnlyAdmin}
                                onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                                title={
                                  isSelf
                                    ? 'You cannot modify your own role'
                                    : isOnlyAdmin
                                    ? 'Cannot demote the only remaining administrator'
                                    : 'Change user role'
                                }
                                className={`text-xs font-medium rounded-lg border px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                                  isSelf || isOnlyAdmin ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                                }`}
                              >
                                <option value="user">Member</option>
                                <option value="admin">Admin</option>
                              </select>
                            </>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-[11px]">
                          {new Date(user.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Reset Password Button */}
                            <button
                              onClick={() => {
                                setRevealedResetPassword(null);
                                setCustomResetPassword('');
                                setResetPasswordTargetUser(user);
                              }}
                              title="Reset user password"
                              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete User Button - Protected against self, root, and last admin */}
                            {isRoot ? (
                              <button
                                disabled
                                title="System Administrator cannot be deleted"
                                aria-label="Delete user (disabled: system administrator cannot be deleted)"
                                className="p-1.5 rounded-lg border border-transparent text-muted-foreground/30 cursor-not-allowed"
                              >
                                <Lock className="w-3.5 h-3.5" />
                              </button>
                            ) : isSelf ? (
                              <button
                                disabled
                                title="You cannot delete your own account"
                                aria-label="Delete user (disabled: you cannot delete your own account)"
                                className="p-1.5 rounded-lg border border-transparent text-muted-foreground/30 cursor-not-allowed"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : isOnlyAdmin ? (
                              <button
                                disabled
                                title="Cannot delete the only remaining administrator"
                                aria-label="Delete user (disabled: cannot delete the only remaining administrator)"
                                className="p-1.5 rounded-lg border border-transparent text-muted-foreground/30 cursor-not-allowed"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => setDeleteTargetUser(user)}
                                title="Delete user"
                                className="p-1.5 rounded-lg border border-border text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INVITATIONS */}
      {activeTab === 'invitations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Pending registration invites. Invitees can complete account setup using their unique link.
            </p>
            <button
              onClick={() => {
                setCreatedInviteResult(null);
                setShowInviteModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
            >
              <MailPlus className="w-3.5 h-3.5" />
              New Invite
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Loading invitations...</div>
          ) : invitations.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-border text-muted-foreground">
              <Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs font-medium">No pending invitations.</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Click "Invite User" above to invite members or administrators.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="min-w-full divide-y divide-border text-left">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Invited Email
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Status / Expiry
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {invitations.map((inv) => {
                    const isExpired =
                      inv.isExpired ?? new Date() > new Date(inv.expiresAt);
                    const expiryDate = new Date(inv.expiresAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });

                    return (
                      <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                          {inv.email}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              inv.role === 'admin'
                                ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 dark:text-purple-400 border border-purple-500/20'
                                : 'bg-blue-500/10 text-blue-700 dark:text-blue-300 dark:text-blue-400 border border-blue-500/20'
                            }`}
                          >
                            {inv.role === 'admin' ? 'Administrator' : 'Member'}
                          </span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            {isExpired ? (
                              <span className="text-destructive font-medium">Expired ({expiryDate})</span>
                            ) : (
                              <span className="text-muted-foreground">Expires {expiryDate}</span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Copy Link Button */}
                            <button
                              onClick={() => copyToClipboard(inv.inviteUrl, `inv-${inv.id}`)}
                              title="Copy invitation link"
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-input bg-background hover:bg-muted transition-all"
                            >
                              {copiedKey === `inv-${inv.id}` ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  <span className="text-emerald-600 dark:text-emerald-400 dark:text-emerald-400">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy Link</span>
                                </>
                              )}
                            </button>

                            {/* Resend Button */}
                            <button
                              onClick={() => handleResendInvitation(inv)}
                              title="Resend email and refresh expiration date"
                              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                            </button>

                            {/* Revoke Button */}
                            <button
                              onClick={() => handleRevokeInvitation(inv.id)}
                              title="Revoke invitation"
                              className="p-1.5 rounded-lg border border-border text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: SEND INVITATION */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl border border-border space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <MailPlus className="w-4 h-4 text-primary" />
                Invite New User
              </h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createdInviteResult ? (
              /* Success / Result Screen */
              <div className="space-y-4 pt-1">
                <div
                  className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                    createdInviteResult.emailSent
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300 dark:text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-200 dark:text-amber-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {createdInviteResult.emailSent ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <div className="font-bold">
                        {createdInviteResult.emailSent
                          ? 'Email Invitation Sent!'
                          : 'Invitation Link Ready'}
                      </div>
                      <div className="mt-0.5">
                        {createdInviteResult.emailStatus ||
                          'Share the link below with the user to allow them to register.'}
                      </div>
                      {!createdInviteResult.emailSent && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowSmtpModal(true)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-background text-foreground border border-border hover:bg-muted transition-all"
                          >
                            <Settings className="w-3 h-3" />
                            Configure SMTP
                          </button>
                          {smtpSettings?.isConfigured && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const res = await invitationApi.resend(createdInviteResult.id);
                                  setCreatedInviteResult(res.data);
                                } catch (err: any) {
                                  showToast('error', err.response?.data?.error || 'Failed to resend invitation');
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
                            >
                              <RotateCw className="w-3 h-3" />
                              Send Email Now
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="invite-link" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Registration Link
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="invite-link"
                      type="text"
                      readOnly
                      value={createdInviteResult.inviteUrl}
                      className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-input bg-muted/50 text-foreground select-all focus:outline-none"
                    />
                    <button
                      onClick={() =>
                        copyToClipboard(createdInviteResult.inviteUrl, 'modal-invite-link')
                      }
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs whitespace-nowrap hover:bg-primary/90 transition-all flex-shrink-0"
                    >
                      {copiedKey === 'modal-invite-link' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-muted text-foreground hover:bg-muted/80 transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Create Form */
              <form onSubmit={handleSendInvitation} className="space-y-4 pt-1">
                <div>
                  <label htmlFor="invite-email" className="block text-xs font-semibold text-foreground mb-1">
                    Email Address <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    className="w-full text-xs px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label htmlFor="invite-role" className="block text-xs font-semibold text-foreground mb-1">
                    Assigned Role
                  </label>
                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="user">Member (Standard recipe & planning access)</option>
                    <option value="admin">Administrator (Full settings & user management)</option>
                  </select>
                </div>

                {/* Live SMTP Status Box */}
                <div
                  className={`flex items-center justify-between gap-2.5 p-3 rounded-xl border text-[11px] ${
                    smtpSettings?.isConfigured
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300 dark:text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-200 dark:text-amber-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {smtpSettings?.isConfigured ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    )}
                    <span>
                      {smtpSettings?.isConfigured
                        ? `SMTP configured (${smtpSettings.host}). Invitation email will be sent automatically.`
                        : 'SMTP is not configured. Configure SMTP to send emails automatically, or share the link manually.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSmtpModal(true)}
                    className="px-2.5 py-1 rounded-lg font-semibold bg-background text-foreground border border-border hover:bg-muted transition-all whitespace-nowrap flex-shrink-0"
                  >
                    {smtpSettings?.isConfigured ? 'Edit SMTP' : 'Configure SMTP'}
                  </button>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-3.5 py-2 text-xs font-medium rounded-xl border border-input bg-background hover:bg-muted text-foreground transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sendingInvite}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
                  >
                    {sendingInvite ? 'Generating...' : 'Create Invitation'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: ADD USER DIRECTLY */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl border border-border space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" />
                Add User Directly
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createdUserPassword ? (
              /* User Created Screen */
              <div className="space-y-4 pt-1">
                <div className="p-3.5 rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300 dark:text-emerald-400 text-xs">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Account Created Successfully!
                  </div>
                  <div className="mt-1 text-[11px]">
                    Provide these credentials to the user. Make sure to copy the temporary password now, as it will not be shown again.
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="generated-password" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Generated Password
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="generated-password"
                      type="text"
                      readOnly
                      value={createdUserPassword}
                      className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-input bg-muted/50 text-foreground select-all focus:outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(createdUserPassword, 'modal-gen-password')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs whitespace-nowrap hover:bg-primary/90 transition-all flex-shrink-0"
                    >
                      {copiedKey === 'modal-gen-password' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-muted text-foreground hover:bg-muted/80 transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Create User Form */
              <form onSubmit={handleCreateUser} className="space-y-3.5 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="create-first-name" className="block text-xs font-semibold text-foreground mb-1">
                      First Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      id="create-first-name"
                      type="text"
                      required
                      value={createFirstName}
                      onChange={(e) => setCreateFirstName(e.target.value)}
                      placeholder="Jane"
                      className="w-full text-xs px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="create-last-name" className="block text-xs font-semibold text-foreground mb-1">
                      Last Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      id="create-last-name"
                      type="text"
                      required
                      value={createLastName}
                      onChange={(e) => setCreateLastName(e.target.value)}
                      placeholder="Doe"
                      className="w-full text-xs px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="create-email" className="block text-xs font-semibold text-foreground mb-1">
                    Email Address <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="create-email"
                    type="email"
                    required
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="jane.doe@example.com"
                    className="w-full text-xs px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label htmlFor="create-username" className="block text-xs font-semibold text-foreground mb-1">
                    Username <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="create-username"
                    type="text"
                    required
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value)}
                    placeholder="janedoe"
                    className="w-full text-xs px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {usernameSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[10px] text-muted-foreground self-center mr-1">
                        Suggestions:
                      </span>
                      {usernameSuggestions.map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => setCreateUsername(sug)}
                          className="px-2 py-0.5 rounded-md text-[11px] border border-input bg-muted/40 hover:bg-muted text-foreground transition-all"
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="create-role" className="block text-xs font-semibold text-foreground mb-1">Role</label>
                  <select
                    id="create-role"
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value as any)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="user">Member</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-3.5 py-2 text-xs font-medium rounded-xl border border-input bg-background hover:bg-muted text-foreground transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingUser}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
                  >
                    {creatingUser ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: RESET PASSWORD */}
      {resetPasswordTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl border border-border space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                Reset Password: @{resetPasswordTargetUser.username}
              </h3>
              <button
                onClick={() => setResetPasswordTargetUser(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {revealedResetPassword ? (
              <div className="space-y-4 pt-1">
                <div className="p-3.5 rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300 dark:text-emerald-400 text-xs">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Password Successfully Reset
                  </div>
                  <div className="mt-1 text-[11px]">
                    Share this temporary password with @{resetPasswordTargetUser.username}.
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="reset-password" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    New Temporary Password
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="reset-password"
                      type="text"
                      readOnly
                      value={revealedResetPassword}
                      className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-input bg-muted/50 text-foreground select-all focus:outline-none"
                    />
                    <button
                      onClick={() =>
                        copyToClipboard(revealedResetPassword, 'modal-reset-password')
                      }
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs whitespace-nowrap hover:bg-primary/90 transition-all flex-shrink-0"
                    >
                      {copiedKey === 'modal-reset-password' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setResetPasswordTargetUser(null)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-muted text-foreground hover:bg-muted/80 transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleExecuteResetPassword} className="space-y-4 pt-1">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Reset credentials for{' '}
                  <strong className="text-foreground">
                    {resetPasswordTargetUser.firstName} {resetPasswordTargetUser.lastName} (
                    {resetPasswordTargetUser.email})
                  </strong>
                  . Leave blank to generate an automatic secure password.
                </p>

                <div>
                  <label htmlFor="custom-reset-password" className="block text-xs font-semibold text-foreground mb-1">
                    Custom Password (Optional)
                  </label>
                  <input
                    id="custom-reset-password"
                    type="text"
                    value={customResetPassword}
                    onChange={(e) => setCustomResetPassword(e.target.value)}
                    placeholder="Leave empty to auto-generate"
                    className="w-full text-xs px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Minimum 6 characters if entered manually.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetPasswordTargetUser(null)}
                    className="px-3.5 py-2 text-xs font-medium rounded-xl border border-input bg-background hover:bg-muted text-foreground transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resettingPassword}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
                  >
                    {resettingPassword ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 4: DELETE USER CONFIRMATION */}
      {deleteTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl border border-border space-y-4">
            <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle className="w-5 h-5" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-foreground">Delete User Account</h3>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Are you sure you want to permanently delete{' '}
                <strong className="text-foreground">@{deleteTargetUser.username}</strong> (
                {deleteTargetUser.email})? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetUser(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-input bg-background hover:bg-muted text-foreground transition-all flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all flex-1"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: SMTP CONFIGURATION */}
      {showSmtpModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl border border-border space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" />
                Configure Outbound Email (SMTP)
              </h3>
              <button
                onClick={() => setShowSmtpModal(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <EmailSettings
              compact
              onSaved={(saved) => {
                setSmtpSettings(saved);
              }}
            />

            <div className="flex justify-end border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setShowSmtpModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-muted text-foreground hover:bg-muted/80 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
