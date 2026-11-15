import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Monitor, ChevronDown, BarChart3, BadgeCheck, MessageSquare, Settings, LogOut, Zap } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useThemeStore } from '@/store/theme.store';

const themeOptions = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const;

export function UserDropdown({
  variant = 'header',
  iconOnly = false,
}: {
  /** 'header': panel opens downward right-aligned. 'footer' (sidebar footer): panel opens upward left-aligned. */
  variant?: 'header' | 'footer';
  /** Avatar-only trigger (sidebar rail mode). */
  iconOnly?: boolean;
} = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSettings = () => {
    setIsOpen(false);
    navigate('/settings');
  };

  const handleAnalytics = () => {
    setIsOpen(false);
    navigate('/analytics');
  };

  const handleAchievements = () => {
    setIsOpen(false);
    navigate('/achievements');
  };

  const handleFeedback = () => {
    setIsOpen(false);
    navigate('/admin/feedback');
  };

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="User menu"
        title={iconOnly ? user.username : undefined}
        className={
          iconOnly && variant === 'footer'
            ? 'flex items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-transform active:scale-[0.98]'
            : 'flex items-center gap-2 px-2 py-2 sm:px-3 text-sm font-medium text-card-foreground bg-card border border-border rounded-lg hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors'
        }
      >
        {user.profilePhotoUrl ? (
          <img
            src={user.profilePhotoUrl}
            alt={user.username}
            className="w-8 h-8 rounded-full object-cover border border-border"
          />
        ) : (
          <div className="flex items-center justify-center w-8 h-8 bg-primary rounded-full text-primary-foreground font-medium">
            {(user.firstName?.[0] || user.username.charAt(0)).toUpperCase()}
          </div>
        )}
        {variant === 'footer' ? (
          !iconOnly && <span className="truncate">{user.username}</span>
        ) : (
          <span className="hidden xl:inline">{user.username}</span>
        )}
        {(!iconOnly || variant === 'header') && (
          <ChevronDown className={`${variant === 'footer' ? 'block' : 'hidden sm:block'} w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
        )}
      </button>

      {isOpen && (
        <div
          className={`absolute w-56 bg-card rounded-lg shadow-lg border border-border py-1 z-10 ${
            variant === 'footer' ? 'bottom-full left-0 mb-2' : 'right-0 mt-2'
          }`}
          role="menu"
          aria-orientation="vertical"
        >
          <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border">
            <div className="font-medium text-card-foreground">{user.username}</div>
            <div className="mt-0.5">{user.email}</div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
              <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium ${
                user.role === 'admin'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-secondary/10 text-secondary'
              }`}>
                {user.role === 'admin' ? 'Administrator' : 'User'}
              </span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground tabular-nums">
                <Zap className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" /> {user.creditsRemaining ?? 10} AI credits
              </span>
            </div>
          </div>

          <div className="border-b border-border px-4 py-2">
            <div className="mb-1.5 text-xs text-muted-foreground">Theme</div>
            <div className="flex gap-1" role="radiogroup" aria-label="Theme">
              {themeOptions.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={theme === value}
                  onClick={() => setTheme(value)}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                    theme === value
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleAnalytics}
            className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:bg-accent"
            role="menuitem"
          >
            <BarChart3 className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            Analytics
          </button>

          <button
            onClick={handleAchievements}
            className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:bg-accent"
            role="menuitem"
          >
            <BadgeCheck className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            Achievements
          </button>

          {user.role === 'admin' && (
            <button
              onClick={handleFeedback}
              className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:bg-accent"
              role="menuitem"
            >
              <MessageSquare className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
              Feedback inbox
            </button>
          )}

          <button
            onClick={handleSettings}
            className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:bg-accent"
            role="menuitem"
          >
            <Settings className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            Settings
          </button>

          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:bg-destructive/10"
            role="menuitem"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
