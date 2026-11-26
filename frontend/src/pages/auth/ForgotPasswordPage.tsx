import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { AuthInput } from '../../components/auth/AuthInput';
import { AuthButton } from '../../components/auth/AuthButton';
import { authApi } from '../../services/authApi';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setGeneralError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.requestPasswordReset({ email: trimmed.toLowerCase() });
      setIsSubmitted(true);
    } catch {
      // In accordance with security standards, always show accepted message
      setIsSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="w-full">
        <h1 className="font-heading text-4xl sm:text-5xl md:text-[54px] tracking-tight uppercase text-[#111111] mb-4 font-normal">
          RESET PASSWORD
        </h1>

        <p className="mb-6 text-sm sm:text-base leading-relaxed text-slate-700">
          Enter your registered email address and we will send you instructions to reset your password.
        </p>

        {generalError && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-red-200 bg-red-50/90 px-5 py-3.5 text-sm text-red-800"
          >
            {generalError}
          </div>
        )}

        {isSubmitted ? (
          <div className="space-y-6">
            <div
              role="status"
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-relaxed text-emerald-900"
            >
              If an account with that email exists, password reset instructions have been sent. Please check your email inbox and spam folder.
            </div>

            <div>
              <Link to="/login" className="block">
                <AuthButton type="button" variant="primary">
                  Back to Sign In
                </AuthButton>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <AuthInput
                name="email"
                type="email"
                placeholder="Email Address"
                aria-label="Email Address"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                error={emailError || undefined}
                disabled={isLoading}
                required
              />
            </div>

            <div className="pt-2">
              <AuthButton type="submit" variant="primary" isLoading={isLoading}>
                Send Reset Link
              </AuthButton>
            </div>

            <div className="pt-2 text-center">
              <Link
                to="/login"
                className="text-sm font-semibold text-slate-800 hover:text-[#00715D] transition-colors focus:outline-none focus:underline"
              >
                Back to Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
