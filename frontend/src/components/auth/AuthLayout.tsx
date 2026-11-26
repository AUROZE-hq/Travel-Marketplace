import type { ReactNode } from 'react';

interface AuthLayoutProps {
  children: ReactNode;
  leftPanelContent?: ReactNode;
}

export function AuthLayout({ children, leftPanelContent }: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full bg-[#FFFCE9] text-slate-900 antialiased selection:bg-[#00715D] selection:text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col p-4 sm:p-6 lg:flex-row lg:items-center lg:gap-8 lg:p-6 xl:gap-16">
        {/* Left column: Kept empty with warm cream background, reusable for future media */}
        <div className="hidden h-[92vh] max-h-[920px] w-full lg:block lg:w-[48%] xl:w-[47%]">
          {leftPanelContent ? (
            <div className="relative h-full w-full overflow-hidden rounded-[28px]">
              {leftPanelContent}
            </div>
          ) : null}
        </div>

        {/* Right column: Form container - preserved position, dimensions and spacing */}
        <div className="flex flex-1 items-center justify-center py-8 lg:py-0">
          <div className="w-full max-w-[560px] px-2 sm:px-4 lg:px-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
