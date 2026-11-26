import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

type AppLayoutProps = {
  children: ReactNode;
};

const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  const isAuthRoute = AUTH_PATHS.includes(location.pathname);

  // Auth routes and unauthenticated states do not display the marketplace header
  if (isAuthRoute || !isAuthenticated) {
    return <>{children}</>;
  }

  // Marketplace header is displayed strictly for authenticated users on authenticated pages
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/marketplace" className="flex items-center gap-2">
            <span className="font-bold tracking-tight text-slate-900 text-lg">
              Travel Marketplace
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              Sri Lanka
            </span>
          </Link>

          <nav className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{user.fullName}</p>
                  <p className="text-xs text-slate-500">
                    {user.roles.join(', ')} • {user.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="rounded-full border border-slate-300 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
