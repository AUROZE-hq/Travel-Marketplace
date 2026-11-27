import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

interface GuestRouteProps {
  children: ReactNode;
}

export function GuestRoute({ children }: GuestRouteProps) {
  const { isAuthenticated, isLoading, isRestoring } = useAuth();
  const location = useLocation();

  if (isLoading || isRestoring) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FFFCE9]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#00715D] border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated) {
    const from = (location.state as { from?: { pathname?: string } })?.from?.pathname;
    const target = from && from !== '/' && from !== '/login' ? from : '/marketplace';
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}
