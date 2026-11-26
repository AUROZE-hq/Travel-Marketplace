export type Role = 'CUSTOMER' | 'OWNER' | 'DRIVER' | 'ADMIN';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface Me {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  status: UserStatus;
  emailVerified: boolean;
  roles: Role[];
  ownerProfileId: string | null;
  driverProfileId: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: Me;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirmRequest {
  token: string;
  newPassword: string;
}

export interface UpdateMeRequest {
  fullName?: string;
  phone?: string | null;
}

export interface ApiResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; message: string }> | unknown;
  };
}
