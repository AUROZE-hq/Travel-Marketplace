import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { AuthInput } from '../../components/auth/AuthInput';
import { AuthButton } from '../../components/auth/AuthButton';
import { useAuth } from '../../hooks/useAuth';

export function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const { register, isLoading, error, clearError } = useAuth();
  const navigate = useNavigate();

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      errors.fullName = 'Full name is required';
    } else if (trimmedName.length > 120) {
      errors.fullName = 'Full name must be under 120 characters';
    }

    if (!trimmedEmail) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 10) {
      errors.password = 'Password must be at least 10 characters';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Password confirmation is required';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (phone && phone.trim().length > 30) {
      errors.phone = 'Phone number must be under 30 characters';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();

    if (!validate()) return;

    try {
      await register({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        password,
      });
      navigate('/marketplace', { replace: true });
    } catch {
      // Error is set in AuthContext
    }
  };

  return (
    <AuthLayout>
      <div className="w-full">
        <h1 className="font-heading text-4xl sm:text-5xl md:text-[54px] tracking-tight uppercase text-[#111111] mb-6 font-normal">
          CREATE ACCOUNT
        </h1>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-red-200 bg-red-50/90 px-5 py-3.5 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <AuthInput
              name="fullName"
              placeholder="Full Name"
              aria-label="Full Name"
              autoComplete="name"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (validationErrors.fullName) setValidationErrors((prev) => ({ ...prev, fullName: '' }));
              }}
              error={validationErrors.fullName}
              disabled={isLoading}
              required
            />
          </div>

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
                if (validationErrors.email) setValidationErrors((prev) => ({ ...prev, email: '' }));
              }}
              error={validationErrors.email}
              disabled={isLoading}
              required
            />
          </div>

          <div>
            <AuthInput
              name="phone"
              type="tel"
              placeholder="Mobile Number (optional)"
              aria-label="Mobile Number"
              autoComplete="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (validationErrors.phone) setValidationErrors((prev) => ({ ...prev, phone: '' }));
              }}
              error={validationErrors.phone}
              disabled={isLoading}
            />
          </div>

          <div>
            <AuthInput
              name="password"
              isPassword
              placeholder="Password (min. 10 characters)"
              aria-label="Password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (validationErrors.password) setValidationErrors((prev) => ({ ...prev, password: '' }));
              }}
              error={validationErrors.password}
              disabled={isLoading}
              required
            />
          </div>

          <div>
            <AuthInput
              name="confirmPassword"
              isPassword
              placeholder="Confirm Password"
              aria-label="Confirm Password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (validationErrors.confirmPassword) setValidationErrors((prev) => ({ ...prev, confirmPassword: '' }));
              }}
              error={validationErrors.confirmPassword}
              disabled={isLoading}
              required
            />
          </div>

          <div className="pt-2">
            <AuthButton type="submit" variant="primary" isLoading={isLoading}>
              Create Account
            </AuthButton>
          </div>

          <div className="pt-2 text-center">
            <p className="text-sm text-slate-700">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-bold text-[#00715D] hover:underline focus:outline-none"
              >
                Sign In
              </Link>
            </p>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}
