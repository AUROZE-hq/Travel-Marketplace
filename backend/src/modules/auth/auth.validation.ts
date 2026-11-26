import { z } from 'zod';

export const registerSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email({ message: 'Must be a valid email address' })
      .max(255),
    password: z
      .string()
      .min(10, { message: 'Password must be at least 10 characters long' })
      .max(128, { message: 'Password must not exceed 128 characters' }),
    fullName: z
      .string()
      .trim()
      .min(1, { message: 'Full name is required' })
      .max(120, { message: 'Full name cannot exceed 120 characters' }),
    phone: z.string().trim().max(30).optional().nullable(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email({ message: 'Must be a valid email address' })
      .max(255),
    password: z.string().min(1, { message: 'Password is required' }).max(128),
  })
  .strict();

export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1, { message: 'Refresh token is required' }),
  })
  .strict();

export const logoutSchema = z
  .object({
    refreshToken: z.string().min(1, { message: 'Refresh token is required' }),
  })
  .strict();

export const passwordResetRequestSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email({ message: 'Must be a valid email address' })
      .max(255),
  })
  .strict();

export const passwordResetConfirmSchema = z
  .object({
    token: z.string().min(1, { message: 'Reset token is required' }),
    newPassword: z
      .string()
      .min(10, { message: 'Password must be at least 10 characters long' })
      .max(128, { message: 'Password must not exceed 128 characters' }),
  })
  .strict();

export const updateMeSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, { message: 'Full name must be at least 1 character' })
      .max(120, { message: 'Full name cannot exceed 120 characters' })
      .optional(),
    phone: z.string().trim().max(30).optional().nullable(),
  })
  .strict()
  .refine((data) => data.fullName !== undefined || data.phone !== undefined, {
    message: 'At least one field (fullName or phone) must be provided',
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
