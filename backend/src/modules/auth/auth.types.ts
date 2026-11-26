import type { Role, UserStatus } from '@prisma/client';

export interface MeResponse {
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

export interface AuthSessionResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: MeResponse;
}
