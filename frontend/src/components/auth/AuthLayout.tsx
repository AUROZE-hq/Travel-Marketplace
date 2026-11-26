import type { ReactNode } from 'react';
import nineArchBridge from '../../assets/auth/nine-arch-bridge.jpg';

interface AuthLayoutProps {
  children: ReactNode;
  imageAlt?: string;
}

export function AuthLayout({ children, imageAlt = 'Nine Arch Bridge train in Ella, Sri Lanka' }: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full bg-[#FFFCE9] text-slate-900 antialiased selection:bg-[#00715D] selection:text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col p-4 sm:p-6 lg:flex-row lg:items-center lg:gap-8 lg:p-6 xl:gap-16">
        {/* Left column: Scenic photograph */}
        <div className="hidden h-[92vh] max-h-[920px] w-full lg:block lg:w-[48%] xl:w-[47%]">
          <div className="relative h-full w-full overflow-hidden rounded-[28px] shadow-sm">
            <img
              src={nineArchBridge}
              alt={imageAlt}
              className="h-full w-full object-cover object-center"
              loading="eager"
            />
          </div>
        </div>

        {/* Right column: Form container */}
        <div className="flex flex-1 items-center justify-center py-8 lg:py-0">
          <div className="w-full max-w-[560px] px-2 sm:px-4 lg:px-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
