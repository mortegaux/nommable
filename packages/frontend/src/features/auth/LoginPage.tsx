import { useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { useBrandingStore } from '@/store/branding.store';
import { Callout } from '@/components/Callout';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const branding = useBrandingStore((s) => s.branding);
  const appName = branding?.appName ?? 'Nommable';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((state) => state.login);

  const getRedirectTarget = () => {
    const fromState = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    const fromParam = searchParams.get('redirect');
    const target = fromState || fromParam || '/recipes';
    // Only allow same-origin paths to avoid open-redirect
    return target.startsWith('/') && !target.startsWith('//') ? target : '/recipes';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPending(true);

    try {
      await login(username, password);
      navigate(getRedirectTarget(), { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-lg bg-card p-8 shadow-lg border border-border">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-medium leading-tight text-balance text-primary mb-2">{appName}</h1>
          <p className="text-muted-foreground">Recipe management system</p>
        </div>

        <h2 className="mb-6 text-2xl font-medium leading-tight text-balance text-card-foreground">Sign in</h2>

        {error && (
          <Callout tone="error" role="alert" className="mb-4">
            {error}
          </Callout>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-card-foreground mb-1">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Enter your username"
              required
              autoComplete="username"
              aria-required="true"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-card-foreground mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 pr-12 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                aria-required="true"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-primary py-2.5 text-primary-foreground font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {pending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                Signing in
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Ask your administrator for an invitation link
        </p>
      </div>
    </div>
  );
}
