import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { invitationApi } from '@/services/api';
import { Callout } from '@/components/Callout';
import { Eye, EyeOff, Loader2, X } from 'lucide-react';

export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [invitationEmail, setInvitationEmail] = useState('');
  const [invitationValid, setInvitationValid] = useState(false);
  const navigate = useNavigate();
  const registerWithInvite = useAuthStore((state) => state.registerWithInvite);

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setError('Invalid invitation link. Missing token.');
        setLoading(false);
        return;
      }

      try {
        const response = await invitationApi.validate(token);
        setInvitationEmail(response.data.email);
        setInvitationValid(true);
      } catch (err: any) {
        setError('Invalid or expired invitation link.');
      } finally {
        setLoading(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setSubmitting(true);
    try {
      await registerWithInvite(token!, username, password);
      navigate('/recipes');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="inline-block h-8 w-8 animate-spin text-primary" strokeWidth={1.5} />
          <p className="mt-2 text-muted-foreground">Validating invitation</p>
        </div>
      </div>
    );
  }

  if (!invitationValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-md rounded-lg bg-card p-8 shadow-lg border border-border text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <X className="h-6 w-6 text-destructive" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-medium text-card-foreground mb-2">Invalid invitation</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Link
            to="/login"
            className="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-lg bg-card p-8 shadow-lg border border-border">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-medium leading-tight text-balance text-primary mb-2">Nommable</h1>
          <p className="text-muted-foreground">Complete your registration</p>
        </div>

        <div className="mb-6 rounded-lg bg-secondary/10 border border-secondary/20 p-3">
          <p className="text-sm text-card-foreground">
            <span className="font-medium">Email:</span> {invitationEmail}
          </p>
        </div>

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
              placeholder="Choose a username"
              required
              minLength={3}
              autoComplete="username"
              aria-required="true"
            />
            <p className="mt-1 text-xs text-muted-foreground">At least 3 characters</p>
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
                placeholder="Create a password"
                required
                minLength={6}
                autoComplete="new-password"
                aria-required="true"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                { showPassword ? (
                  <EyeOff className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                )}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">At least 6 characters</p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-card-foreground mb-1">
              Confirm password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 pr-12 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Confirm your password"
                required
                autoComplete="new-password"
                aria-required="true"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-pressed={showConfirmPassword}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                { showConfirmPassword ? (
                  <EyeOff className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-primary py-2.5 text-primary-foreground font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                Creating account
              </>
            ) : (
              'Create account'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
