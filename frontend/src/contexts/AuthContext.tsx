import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import axios from 'axios';
import { authApi } from '../services/authApi';
import {
  getRefreshToken,
  setAuthTokens,
  setOnAuthFailure,
} from '../services/apiClient';
import type {
  ApiErrorResponse,
  LoginRequest,
  Me,
  RegisterRequest,
  Role,
} from '../types/auth';
import { AuthContext } from './AuthContextValue';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const restoreStarted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const handleAuthError = (err: unknown): string => {
    if (axios.isAxiosError(err)) {
      const apiErr = err.response?.data as ApiErrorResponse | undefined;
      if (apiErr?.error?.message) {
        return apiErr.error.message;
      }
      if (err.response?.status === 401) {
        return 'Invalid email or password. Please try again.';
      }
      if (err.response?.status === 409) {
        return 'An account with this email already exists.';
      }
      if (err.response?.status === 429) {
        return 'Too many attempts. Please try again in a few minutes.';
      }
      if (err.message) {
        return err.message;
      }
    }
    return 'An unexpected error occurred. Please try again.';
  };

  const login = async (credentials: LoginRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await authApi.login(credentials);
      setAuthTokens(session.accessToken, session.refreshToken);
      setUser(session.user);
    } catch (err) {
      const message = handleAuthError(err);
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await authApi.register(data);
      setAuthTokens(session.accessToken, session.refreshToken);
      setUser(session.user);
    } catch (err) {
      const message = handleAuthError(err);
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    const refreshToken = getRefreshToken();
    try {
      await authApi.logout(refreshToken ? { refreshToken } : undefined);
      setAuthTokens(null, null);
      setUser(null);
      setError(null);
    } catch {
      setError('We could not sign you out right now. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = async () => {
    const refreshToken = getRefreshToken();
    try {
      const session = await authApi.refreshToken(refreshToken ? { refreshToken } : undefined);
      setAuthTokens(session.accessToken, session.refreshToken);
      setUser(session.user);
    } catch {
      setAuthTokens(null, null);
      setUser(null);
    }
  };

  useEffect(() => {
    setOnAuthFailure(() => {
      setUser(null);
    });
  }, []);

  useEffect(() => {
    if (restoreStarted.current) return;
    restoreStarted.current = true;

    void authApi.refreshToken()
      .then((session) => {
        setAuthTokens(session.accessToken, session.refreshToken);
        setUser(session.user);
      })
      .catch(() => {
        setAuthTokens(null, null);
        setUser(null);
      })
      .finally(() => setIsRestoring(false));
  }, []);

  const hasRole = useCallback(
    (role: Role): boolean => {
      return !!user?.roles?.includes(role);
    },
    [user],
  );

  const hasAnyRole = useCallback(
    (roles: Role[]): boolean => {
      if (!user?.roles) return false;
      return roles.some((r) => user.roles.includes(r));
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isRestoring,
        error,
        login,
        register,
        logout,
        refresh,
        clearError,
        hasRole,
        hasAnyRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
