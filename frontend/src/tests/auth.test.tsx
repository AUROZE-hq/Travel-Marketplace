import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthInput } from '../components/auth/AuthInput';
import { AuthButton } from '../components/auth/AuthButton';
import { AuthLayout } from '../components/auth/AuthLayout';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage';
import { AppRoutes } from '../routes/AppRoutes';
import { AppLayout } from '../layouts/AppLayout';
import { AuthProvider } from '../contexts/AuthContext';
import { authApi } from '../services/authApi';

vi.mock('../services/authApi', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    refreshToken: vi.fn(),
    logout: vi.fn(),
    requestPasswordReset: vi.fn(),
    confirmPasswordReset: vi.fn(),
    getMe: vi.fn(),
    updateMe: vi.fn(),
  },
}));

describe('AuthInput Component', () => {
  it('renders input with placeholder and handles text input', () => {
    const handleChange = vi.fn();
    render(
      <AuthInput
        placeholder="Mobile Number,Username or Email"
        value=""
        onChange={handleChange}
      />
    );

    const input = screen.getByPlaceholderText('Mobile Number,Username or Email');
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'user@example.com' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('toggles password visibility when toggle button is clicked', () => {
    render(
      <AuthInput
        isPassword
        placeholder="Password"
        value="secret123"
        onChange={() => {}}
      />
    );

    const input = screen.getByPlaceholderText('Password');
    expect(input).toHaveAttribute('type', 'password');

    const toggleBtn = screen.getByRole('button', { name: /show password/i });
    fireEvent.click(toggleBtn);
    expect(input).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('renders error message when error prop is provided', () => {
    render(
      <AuthInput
        placeholder="Password"
        value=""
        onChange={() => {}}
        error="Password is required"
      />
    );

    expect(screen.getByText('Password is required')).toBeInTheDocument();
  });
});

describe('AuthButton Component', () => {
  it('renders children and responds to clicks', () => {
    const handleClick = vi.fn();
    render(<AuthButton onClick={handleClick}>Sign In</AuthButton>);

    const button = screen.getByRole('button', { name: 'Sign In' });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('shows loading state and disables button when isLoading is true', () => {
    render(<AuthButton isLoading>Sign In</AuthButton>);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button.querySelector('svg.animate-spin')).toBeInTheDocument();
  });
});

describe('AuthLayout Component', () => {
  it('renders without an image by default and preserves left column structure', () => {
    render(
      <AuthLayout>
        <div>Form Content</div>
      </AuthLayout>
    );

    expect(screen.getByText('Form Content')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders reusable left panel content when provided', () => {
    render(
      <AuthLayout leftPanelContent={<div data-testid="custom-media">Scenic Visual</div>}>
        <div>Form Content</div>
      </AuthLayout>
    );

    expect(screen.getByTestId('custom-media')).toBeInTheDocument();
    expect(screen.getByText('Scenic Visual')).toBeInTheDocument();
  });
});

describe('LoginPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all Figma login elements correctly', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/mobile number,username or email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.getByText('Forgot Password?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create new account/i })).toBeInTheDocument();
  });

  it('shows validation error when submitting with empty fields', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it('shows Google OAuth notice when Continue with Google is clicked', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(screen.getByText(/google sign-in is planned for a future release/i)).toBeInTheDocument();
  });
});

describe('RegisterPage Component', () => {
  it('renders registration form fields correctly', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Full Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email Address')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/mobile number/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password (min. 10 characters)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm Password')).toBeInTheDocument();
  });

  it('validates password mismatch on registration', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText('Full Name'), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByPlaceholderText('Email Address'), { target: { value: 'test@auroze.lk' } });
    fireEvent.change(screen.getByPlaceholderText('Password (min. 10 characters)'), { target: { value: 'SecurePass123!' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), { target: { value: 'DifferentPass!' } });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });
});

describe('ForgotPasswordPage Component', () => {
  it('renders instructions and email input', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ForgotPasswordPage />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email Address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('validates empty email submission', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ForgotPasswordPage />
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    });
  });

  it('displays safe success message on submission', async () => {
    vi.mocked(authApi.requestPasswordReset).mockResolvedValueOnce(undefined);

    render(
      <MemoryRouter>
        <AuthProvider>
          <ForgotPasswordPage />
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText('Email Address'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/if an account with that email exists/i)).toBeInTheDocument();
    });
  });
});

describe('ResetPasswordPage Component', () => {
  it('shows error state when reset token is missing from URL', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/missing reset token in url/i)).toBeInTheDocument();
  });

  it('renders new password inputs when token is present', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-token-123']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText('New Password (min 10 chars)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm New Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
  });
});

describe('Direct Authentication Entry & Routing', () => {
  it('unauthenticated user opening / is immediately redirected to /login', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <AppLayout>
            <AppRoutes />
          </AppLayout>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
      // Ensure the marketplace header with Sign In/Sign Up is NOT displayed
      expect(screen.queryByText(/travel marketplace/i)).not.toBeInTheDocument();
    });
  });
});
