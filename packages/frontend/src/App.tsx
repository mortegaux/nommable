import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastHost } from '@/components/ToastHost';
import { ConfirmHost } from '@/components/ConfirmHost';
import { useAuthStore } from '@/store/auth.store';
import { useBrandingStore } from '@/store/branding.store';

// Features
import LoginPage from '@/features/auth/LoginPage';
import RegisterPage from '@/features/auth/RegisterPage';
import DashboardLayout from '@/features/layout/DashboardLayout';
import RecipesPage from '@/features/recipes/RecipesPage';
import RecipeDetailPage from '@/features/recipes/RecipeDetailPage';
import RecipeForm from '@/features/recipes/RecipeForm';
import RecipeEditPage from '@/features/recipes/RecipeEditPage';
import MealPlansPage from '@/features/meal-plans/MealPlansPage';
import MealPlanBuilder from '@/features/meal-plans/MealPlanBuilder';
import MealPlanDashboard from '@/features/meal-plans/MealPlanDashboard';
import ShoppingListsPage from '@/features/shopping-lists/ShoppingListsPage';
import SettingsPage from '@/features/settings/SettingsPage';
import BrandingSettingsPage from '@/features/settings/BrandingSettingsPage';
import TaxonomyManagement from '@/features/settings/TaxonomyManagement';
import PantryPage from '@/features/pantry/PantryPage';
import AnalyticsPage from '@/features/analytics/AnalyticsPage';
import BatchCookingPage from '@/features/batch-cooking/BatchCookingPage';
import GamificationPage from '@/features/gamification/GamificationPage';
import CollectionsPage from '@/features/collections/CollectionsPage';
import KitchenTodayPage from '@/features/kitchen-today/KitchenTodayPage';
import CollectionDetailPage from '@/features/collections/CollectionDetailPage';
import NotFoundPage from '@/features/errors/NotFoundPage';
import FeedbackInboxPage from '@/features/feedback/FeedbackInboxPage';
import SetupWizardPage from '@/features/setup/SetupWizardPage';

function TransientAuthError() {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  return (
    <div className="flex h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold">Connection issue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Couldn&apos;t reach the server to verify your session. Your session is safe —
          this is a temporary connection problem, not a logout.
        </p>
        <button
          type="button"
          onClick={() => checkAuth()}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, needsSetup, authError } = useAuthStore();

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  // Transient /me failure (429 / 5xx / network): keep the session, show a
  // retry screen instead of bouncing to /login (issue #70).
  if (authError === 'transient') {
    return <TransientAuthError />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicAuthRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, needsSetup } = useAuthStore();

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, needsSetup, authError } = useAuthStore();

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  // Same transient guard as ProtectedRoute (issue #70).
  if (authError === 'transient') {
    return <TransientAuthError />;
  }

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const loadBranding = useBrandingStore((state) => state.loadBranding);

  useEffect(() => {
    checkAuth();
    // Instance branding is server-side and public: load once for every
    // visitor (header, login page, tab title) regardless of auth state.
    loadBranding();
  }, [checkAuth, loadBranding]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<SetupWizardPage />} />
        <Route
          path="/login"
          element={
            <PublicAuthRoute>
              <LoginPage />
            </PublicAuthRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicAuthRoute>
              <RegisterPage />
            </PublicAuthRoute>
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<KitchenTodayPage />} />
          {/* Former Kitchen Today URL — renamed to /dashboard. */}
          <Route path="kitchen-today" element={<Navigate to="/dashboard" replace />} />
          <Route path="recipes" element={<RecipesPage />} />
          <Route path="recipes/new" element={<RecipeForm />} />
          <Route path="recipes/:id/edit" element={<RecipeEditPage />} />
          <Route path="recipes/:id" element={<RecipeDetailPage />} />
          <Route path="collections" element={<CollectionsPage />} />
          <Route path="collections/:id" element={<CollectionDetailPage />} />
          <Route path="meal-plans" element={<MealPlansPage />} />
          <Route path="meal-plans/new" element={<MealPlanBuilder />} />
          <Route path="meal-plans/:id" element={<MealPlanDashboard />} />
          <Route path="shopping-lists" element={<ShoppingListsPage />} />
          <Route path="shopping-lists/:id" element={<ShoppingListsPage />} />
          <Route path="pantry" element={<PantryPage />} />
          <Route path="batch-cooking" element={<BatchCookingPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="achievements" element={<GamificationPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/taxonomies" element={<TaxonomyManagement />} />
          <Route
            path="settings/branding"
            element={
              <AdminRoute>
                <BrandingSettingsPage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/feedback"
            element={
              <AdminRoute>
                <FeedbackInboxPage />
              </AdminRoute>
            }
          />
          {/* 404 - Must be last */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* 404 for unauthenticated routes */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <ToastHost />
      <ConfirmHost />
    </BrowserRouter>
  );
}

export default App;
