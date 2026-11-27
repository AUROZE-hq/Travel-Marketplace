import { apiClient } from './apiClient';
import type {
  ApiResponse,
  AuthSession,
  LoginRequest,
  LogoutRequest,
  Me,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  RefreshTokenRequest,
  RegisterRequest,
  UpdateMeRequest,
} from '../types/auth';

export const authApi = {
  async register(payload: RegisterRequest): Promise<AuthSession> {
    const response = await apiClient.post<ApiResponse<AuthSession>>('/auth/register', payload);
    return response.data.data;
  },

  async login(payload: LoginRequest): Promise<AuthSession> {
    const response = await apiClient.post<ApiResponse<AuthSession>>('/auth/login', payload);
    return response.data.data;
  },

  async refreshToken(payload?: RefreshTokenRequest): Promise<AuthSession> {
    const response = await apiClient.post<ApiResponse<AuthSession>>('/auth/refresh', payload ?? {});
    return response.data.data;
  },

  async logout(payload?: LogoutRequest): Promise<void> {
    await apiClient.post('/auth/logout', payload ?? {});
  },

  async requestPasswordReset(payload: PasswordResetRequest): Promise<void> {
    await apiClient.post('/auth/password-reset/request', payload);
  },

  async confirmPasswordReset(payload: PasswordResetConfirmRequest): Promise<void> {
    await apiClient.post('/auth/password-reset/confirm', payload);
  },

  async getMe(): Promise<Me> {
    const response = await apiClient.get<ApiResponse<Me>>('/users/me');
    return response.data.data;
  },

  async updateMe(payload: UpdateMeRequest): Promise<Me> {
    const response = await apiClient.patch<ApiResponse<Me>>('/users/me', payload);
    return response.data.data;
  },
};
