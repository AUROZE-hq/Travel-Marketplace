import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage';
import { GuestRoute } from '../components/auth/GuestRoute';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { useAuth } from '../hooks/useAuth';

function RootEntry() {
  const { isAuthenticated, isLoading, isRestoring } = useAuth();

  if (isLoading || isRestoring) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FFFCE9]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#00715D] border-t-transparent" />
      </div>
    );
  }

  // Opening / immediately displays login page for unauthenticated users, or marketplace homepage when authenticated
  if (isAuthenticated) {
    return <Navigate to="/marketplace" replace />;
  }

  return <Navigate to="/login" replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Direct Authentication Entry: Unauthenticated users are sent to login; authenticated go to /marketplace */}
      <Route path="/" element={<RootEntry />} />

      {/* Authenticated Marketplace Homepage */}
      <Route
        path="/marketplace"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route path="/home" element={<Navigate to="/marketplace" replace />} />

      {/* Authentication Pages (Guest Only) */}
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <GuestRoute>
            <ForgotPasswordPage />
          </GuestRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <GuestRoute>
            <ResetPasswordPage />
          </GuestRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
