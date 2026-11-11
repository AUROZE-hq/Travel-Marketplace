import type { ReactNode } from 'react';

type AppLayoutProps = {
  children: ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="font-semibold tracking-tight text-slate-900">Travel Marketplace</span>
          <span className="text-sm text-slate-500">Sri Lanka</span>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
