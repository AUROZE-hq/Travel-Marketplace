import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface AuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'secondary';
  isLoading?: boolean;
  leftIcon?: ReactNode;
}

export function AuthButton({
  children,
  variant = 'primary',
  isLoading = false,
  leftIcon,
  className = '',
  disabled,
  ...props
}: AuthButtonProps) {
  const baseClasses =
    'relative flex h-14 w-full items-center justify-center rounded-full text-base font-bold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60';

  const variantClasses = {
    primary:
      'bg-[#00715D] text-white hover:bg-[#005D4C] focus:ring-[#00715D] shadow-sm',
    outline:
      'border-2 border-[#00715D] bg-transparent text-[#00715D] hover:bg-[#00715D]/10 focus:ring-[#00715D]',
    secondary:
      'bg-slate-200 text-slate-800 hover:bg-slate-300 focus:ring-slate-400',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          <span>Processing...</span>
        </span>
      ) : (
        <span className="flex items-center justify-center gap-3">
          {leftIcon && <span className="flex items-center">{leftIcon}</span>}
          <span>{children}</span>
        </span>
      )}
    </button>
  );
}
