import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { AuthInput } from '../../components/auth/AuthInput';
import { AuthButton } from '../../components/auth/AuthButton';
import { useAuth } from '../../hooks/useAuth';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationErrors, setValidationErrors] = useState<{ email?: string; password?: string }>({});
  const [googleNotice, setGoogleNotice] = useState(false);

  const { login, isLoading, error, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname;
  const destination = from && from !== '/' && from !== '/login' ? from : '/marketplace';

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setGoogleNotice(false);

    if (!validate()) return;

    try {
      await login({ email: email.trim(), password });
      navigate(destination, { replace: true });
    } catch {
      // Error is set in AuthContext
    }
  };

  return (
    <AuthLayout>
      <div className="w-full">
        <h1 className="font-heading text-4xl sm:text-5xl md:text-[54px] tracking-tight uppercase text-[#111111] mb-8 font-normal">
          WELCOME BACK
        </h1>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-red-200 bg-red-50/90 px-5 py-3.5 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {googleNotice && (
          <div
            role="status"
            className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-sm text-amber-900"
          >
            Google Sign-In is planned for a future release. Please sign in with email and password.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <AuthInput
              name="email"
              type="email"
              autoComplete="username"
              placeholder="Email Address"
              aria-label="Email Address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (validationErrors.email) setValidationErrors((prev) => ({ ...prev, email: undefined }));
              }}
              error={validationErrors.email}
              disabled={isLoading}
              required
            />
          </div>

          <div>
            <AuthInput
              name="password"
              isPassword
              autoComplete="current-password"
              placeholder="Password"
              aria-label="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (validationErrors.password) setValidationErrors((prev) => ({ ...prev, password: undefined }));
              }}
              error={validationErrors.password}
              disabled={isLoading}
              required
            />
            <div className="mt-2 flex justify-end pr-2">
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-[#00715D] underline-offset-2 hover:underline focus:outline-none focus:underline sm:text-sm"
              >
                Forgot Password?
              </Link>
            </div>
          </div>

          <div className="pt-2">
            <AuthButton type="submit" variant="primary" isLoading={isLoading}>
              Sign In
            </AuthButton>
          </div>

          <div>
            <AuthButton
              type="button"
              variant="outline"
              onClick={() => setGoogleNotice(true)}
              leftIcon={
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
              }
            >
              Continue with Google
            </AuthButton>
          </div>

          <div>
            <AuthButton
              type="button"
              variant="outline"
              onClick={() => navigate('/register')}
            >
              Create new account
            </AuthButton>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}
