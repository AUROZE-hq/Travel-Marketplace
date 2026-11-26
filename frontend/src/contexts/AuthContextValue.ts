import { createContext } from 'react';
import type { LoginRequest, Me, RegisterRequest, Role } from '../types/auth';

export interface AuthContextType {
  user: Me | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
  hasRole: (role: Role) => boolean;
  hasAnyRole: (roles: Role[]) => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
