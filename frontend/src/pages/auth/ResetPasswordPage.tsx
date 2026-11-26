import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { AuthInput } from '../../components/auth/AuthInput';
import { AuthButton } from '../../components/auth/AuthButton';
import { authApi } from '../../services/authApi';
import type { ApiErrorResponse } from '../../types/auth';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationErrors, setValidationErrors] = useState<{ password?: string; confirm?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const navigate = useNavigate();

  const validate = (): boolean => {
    const errors: { password?: string; confirm?: string } = {};

    if (!newPassword) {
      errors.password = 'New password is required';
    } else if (newPassword.length < 10) {
      errors.password = 'Password must be at least 10 characters';
    }

    if (!confirmPassword) {
      errors.confirm = 'Please confirm your new password';
    } else if (newPassword !== confirmPassword) {
      errors.confirm = 'Passwords do not match';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!token) {
      setServerError('Reset token is missing from the URL.');
      return;
    }

    if (!validate()) return;

    setIsLoading(true);
    try {
      await authApi.confirmPasswordReset({
        token,
        newPassword,
      });
      setIsSuccess(true);
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 3000);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const apiErr = err.response?.data as ApiErrorResponse | undefined;
        setServerError(
          apiErr?.error?.message ||
            'Password reset failed. The link may have expired or already been used.',
        );
      } else {
        setServerError('An unexpected error occurred. Please try requesting a new reset link.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="w-full">
        <h1 className="font-heading text-4xl sm:text-5xl md:text-[54px] tracking-tight uppercase text-[#111111] mb-4 font-normal">
          SET NEW PASSWORD
        </h1>

        <p className="mb-6 text-sm sm:text-base leading-relaxed text-slate-700">
          Please enter your new password below. It must be at least 10 characters long.
        </p>

        {!token && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-red-200 bg-red-50/90 px-5 py-4 text-sm text-red-800"
          >
            Missing reset token in URL. Please use the complete link sent to your email.
          </div>
        )}

        {serverError && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-red-200 bg-red-50/90 px-5 py-3.5 text-sm text-red-800"
          >
            {serverError}
          </div>
        )}

        {isSuccess ? (
          <div className="space-y-6">
            <div
              role="status"
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-relaxed text-emerald-900"
            >
              Your password has been successfully reset! Redirecting you to the sign in page in 3 seconds...
            </div>

            <div>
              <Link to="/login" className="block">
                <AuthButton type="button" variant="primary">
                  Proceed to Sign In
                </AuthButton>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <AuthInput
                name="newPassword"
                isPassword
                placeholder="New Password (min 10 chars)"
                aria-label="New Password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (validationErrors.password) setValidationErrors((prev) => ({ ...prev, password: undefined }));
                }}
                error={validationErrors.password}
                disabled={isLoading || !token}
                required
              />
            </div>

            <div>
              <AuthInput
                name="confirmPassword"
                isPassword
                placeholder="Confirm New Password"
                aria-label="Confirm New Password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (validationErrors.confirm) setValidationErrors((prev) => ({ ...prev, confirm: undefined }));
                }}
                error={validationErrors.confirm}
                disabled={isLoading || !token}
                required
              />
            </div>

            <div className="pt-2">
              <AuthButton type="submit" variant="primary" isLoading={isLoading} disabled={!token}>
                Reset Password
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
