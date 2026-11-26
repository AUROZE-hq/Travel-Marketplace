import { PrismaClient, Role, UserStatus } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma as defaultPrisma } from '../../config/prisma.js';
import { NotFoundError } from '../../shared/errors/DomainError.js';
import { isUniqueViolation } from '../../shared/db/pgErrors.js';
import { runInTransaction } from '../../shared/db/transaction.js';
import {
  AccountDisabledError,
  BadRequestError,
  DuplicateEmailError,
  ForbiddenError,
  InvalidCredentialsError,
  UnauthenticatedError,
} from './auth.errors.js';
import type { AuthSessionResponse, MeResponse } from './auth.types.js';
import type {
  LoginInput,
  LogoutInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  RefreshTokenInput,
  RegisterInput,
  UpdateMeInput,
} from './auth.validation.js';
import { emailService, type EmailService } from './email.service.js';
import { dummyPasswordVerification, hashPassword, verifyPassword } from './password.util.js';
import {
  generateOpaqueToken,
  getPasswordResetTokenExpiresAt,
  getRefreshTokenExpiresAt,
  hashToken,
  signAccessToken,
} from './token.util.js';

export function formatMe(
  user: {
    id: string;
    email: string;
    phone: string | null;
    fullName: string;
    status: UserStatus;
    emailVerifiedAt: Date | null;
  },
  roles: Role[],
  ownerProfileId: string | null = null,
  driverProfileId: string | null = null,
): MeResponse {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    status: user.status,
    emailVerified: user.emailVerifiedAt !== null,
    roles,
    ownerProfileId,
    driverProfileId,
  };
}

export class AuthService {
  constructor(
    private readonly db: PrismaClient = defaultPrisma,
    private readonly mailer: EmailService = emailService,
  ) {}

  /**
   * Registers a customer account atomically and returns an authenticated session.
   */
  async register(
    input: RegisterInput,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<AuthSessionResponse> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);
    const refreshToken = generateOpaqueToken();
    const tokenHash = hashToken(refreshToken);
    const expiresAt = getRefreshTokenExpiresAt();

    try {
      const result = await runInTransaction(this.db, async (tx) => {
        // 1. Create User
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            fullName: input.fullName.trim(),
            phone: input.phone?.trim() ?? null,
            status: UserStatus.ACTIVE,
          },
        });

        // 2. Assign only CUSTOMER role
        await tx.userRole.create({
          data: {
            userId: user.id,
            role: Role.CUSTOMER,
          },
        });

        // 3. Create CustomerProfile
        await tx.customerProfile.create({
          data: {
            userId: user.id,
          },
        });

        // 4. Create initial AuthSession
        const authSession = await tx.authSession.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
            ipAddress: meta?.ip,
            userAgent: meta?.userAgent,
          },
        });

        // 5. Audit log
        await tx.authAuditLog.create({
          data: {
            userId: user.id,
            event: 'REGISTER',
            ipAddress: meta?.ip,
            userAgent: meta?.userAgent,
          },
        });

        return { user, authSession };
      });

      const { token: accessToken, expiresIn } = signAccessToken({
        sub: result.user.id,
        email: result.user.email,
        roles: [Role.CUSTOMER],
        sid: result.authSession.id,
      });

      return {
        accessToken,
        refreshToken,
        expiresIn,
        user: formatMe(result.user, [Role.CUSTOMER], null, null),
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateEmailError('An account with this email already exists');
      }
      throw error;
    }
  }

  /**
   * Authenticates with email and password and creates a new session.
   */
  async login(
    input: LoginInput,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<AuthSessionResponse> {
    const email = input.email.trim().toLowerCase();
    const user = await this.db.user.findUnique({
      where: { email },
      include: {
        roles: true,
        ownerProfile: { select: { id: true } },
        driverProfile: { select: { id: true } },
      },
    });

    if (!user) {
      await dummyPasswordVerification(input.password);
      await this.db.authAuditLog.create({
        data: {
          event: 'LOGIN_FAILURE',
          ipAddress: meta?.ip,
          userAgent: meta?.userAgent,
          metadata: { reason: 'USER_NOT_FOUND' },
        },
      });
      throw new InvalidCredentialsError();
    }

    const { valid, needsRehash } = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      await this.db.authAuditLog.create({
        data: {
          userId: user.id,
          event: 'LOGIN_FAILURE',
          ipAddress: meta?.ip,
          userAgent: meta?.userAgent,
          metadata: { reason: 'INVALID_PASSWORD' },
        },
      });
      throw new InvalidCredentialsError();
    }

    if (user.status !== UserStatus.ACTIVE) {
      await this.db.authAuditLog.create({
        data: {
          userId: user.id,
          event: 'LOGIN_BLOCKED',
          ipAddress: meta?.ip,
          userAgent: meta?.userAgent,
          metadata: { status: user.status },
        },
      });
      throw new AccountDisabledError();
    }

    // Upgrade legacy hash safely without risking overwriting a concurrent password reset
    if (needsRehash) {
      const newHash = await hashPassword(input.password);
      await this.db.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash },
        data: { passwordHash: newHash },
      });
    }

    const refreshToken = generateOpaqueToken();
    const tokenHash = hashToken(refreshToken);
    const expiresAt = getRefreshTokenExpiresAt();

    const authSession = await runInTransaction(this.db, async (tx) => {
      // Re-validate that the user's passwordHash has not been concurrently changed
      const current = await tx.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true, status: true },
      });

      if (
        !current ||
        current.status !== UserStatus.ACTIVE ||
        (current.passwordHash !== user.passwordHash && !needsRehash)
      ) {
        throw new InvalidCredentialsError();
      }

      const session = await tx.authSession.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          ipAddress: meta?.ip,
          userAgent: meta?.userAgent,
        },
      });

      await tx.authAuditLog.create({
        data: {
          userId: user.id,
          event: 'LOGIN_SUCCESS',
          ipAddress: meta?.ip,
          userAgent: meta?.userAgent,
        },
      });

      return session;
    });

    const roles = user.roles.map((r) => r.role);
    const { token: accessToken, expiresIn } = signAccessToken({
      sub: user.id,
      email: user.email,
      roles,
      sid: authSession.id,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn,
      user: formatMe(user, roles, user.ownerProfile?.id, user.driverProfile?.id),
    };
  }

  /**
   * Validates and rotates an opaque refresh token with reuse detection.
   */
  async refresh(
    input: RefreshTokenInput,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<AuthSessionResponse> {
    const tokenHash = hashToken(input.refreshToken);
    const session = await this.db.authSession.findUnique({
      where: { tokenHash },
    });

    // If token not found in database, check if it was previously rotated (reuse attack)
    if (!session) {
      const replacedSession = await this.db.authSession.findFirst({
        where: { replacedByTokenHash: tokenHash },
      });

      if (replacedSession) {
        // Reuse detected! Invalidate entire session family
        await this.db.authSession.updateMany({
          where: { familyId: replacedSession.familyId },
          data: { isRevoked: true, revokedAt: new Date() },
        });

        await this.db.authAuditLog.create({
          data: {
            userId: replacedSession.userId,
            event: 'REFRESH_REUSE_DETECTED',
            ipAddress: meta?.ip,
            userAgent: meta?.userAgent,
            metadata: { familyId: replacedSession.familyId },
          },
        });
      }

      throw new UnauthenticatedError('Invalid or revoked refresh token');
    }

    // If session is already revoked, reuse detected on that token
    if (session.isRevoked) {
      await this.db.authSession.updateMany({
        where: { familyId: session.familyId },
        data: { isRevoked: true, revokedAt: new Date() },
      });

      await this.db.authAuditLog.create({
        data: {
          userId: session.userId,
          event: 'REFRESH_REUSE_DETECTED',
          ipAddress: meta?.ip,
          userAgent: meta?.userAgent,
          metadata: { familyId: session.familyId },
        },
      });

      throw new UnauthenticatedError('Invalid or revoked refresh token');
    }

    // Check expiration
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.db.authSession.update({
        where: { id: session.id },
        data: { isRevoked: true, revokedAt: new Date() },
      });
      throw new UnauthenticatedError('Refresh token has expired');
    }

    // Verify user account status
    const user = await this.db.user.findUnique({
      where: { id: session.userId },
      include: {
        roles: true,
        ownerProfile: { select: { id: true } },
        driverProfile: { select: { id: true } },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.db.authSession.update({
        where: { id: session.id },
        data: { isRevoked: true, revokedAt: new Date() },
      });
      throw new AccountDisabledError();
    }

    // Rotate refresh token atomically
    const newRefreshToken = generateOpaqueToken();
    const newHash = hashToken(newRefreshToken);
    const newExpiresAt = getRefreshTokenExpiresAt();

    let isConcurrentReuse = false;
    let newSessionId = '';

    await runInTransaction(this.db, async (tx) => {
      // Mark old session revoked only if not already revoked (atomic concurrency check)
      const updateResult = await tx.authSession.updateMany({
        where: { id: session.id, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          replacedByTokenHash: newHash,
        },
      });

      if (updateResult.count === 0) {
        isConcurrentReuse = true;
        return; // Don't throw inside tx, allow tx to commit cleanly so family revocation can persist
      }

      // Create replacement session with same familyId
      const newSession = await tx.authSession.create({
        data: {
          userId: user.id,
          familyId: session.familyId,
          tokenHash: newHash,
          expiresAt: newExpiresAt,
          ipAddress: meta?.ip,
          userAgent: meta?.userAgent,
        },
      });

      newSessionId = newSession.id;

      await tx.authAuditLog.create({
        data: {
          userId: user.id,
          event: 'REFRESH_SUCCESS',
          ipAddress: meta?.ip,
          userAgent: meta?.userAgent,
        },
      });
    });

    if (isConcurrentReuse) {
      // Persist family revocation and audit log outside the racing transaction
      await this.db.authSession.updateMany({
        where: { familyId: session.familyId },
        data: { isRevoked: true, revokedAt: new Date() },
      });

      await this.db.authAuditLog.create({
        data: {
          userId: session.userId,
          event: 'REFRESH_REUSE_DETECTED',
          ipAddress: meta?.ip,
          userAgent: meta?.userAgent,
          metadata: { familyId: session.familyId },
        },
      });

      throw new UnauthenticatedError('Invalid or revoked refresh token');
    }

    const roles = user.roles.map((r) => r.role);
    const { token: accessToken, expiresIn } = signAccessToken({
      sub: user.id,
      email: user.email,
      roles,
      sid: newSessionId,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn,
      user: formatMe(user, roles, user.ownerProfile?.id, user.driverProfile?.id),
    };
  }

  /**
   * Revokes the current session. Enforces refresh-token ownership.
   */
  async logout(userId: string, input: LogoutInput): Promise<void> {
    const tokenHash = hashToken(input.refreshToken);
    const session = await this.db.authSession.findUnique({
      where: { tokenHash },
    });

    if (!session) {
      // Nothing to revoke or already revoked
      return;
    }

    if (session.userId !== userId) {
      throw new ForbiddenError("Cannot revoke another user's session");
    }

    await this.db.authSession.update({
      where: { id: session.id },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  }

  /**
   * Requests a password reset. Always returns cleanly to prevent account enumeration.
   */
  async requestPasswordReset(
    input: PasswordResetRequestInput,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    const email = input.email.trim().toLowerCase();
    const user = await this.db.user.findUnique({ where: { email } });

    if (user && user.status === UserStatus.ACTIVE) {
      const resetToken = generateOpaqueToken(32);
      const tokenHash = hashToken(resetToken);
      const expiresAt = getPasswordResetTokenExpiresAt();

      await runInTransaction(this.db, async (tx) => {
        // Invalidate previous unused reset tokens for this user
        await tx.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });

        // Store new hashed token
        await tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        });

        await tx.authAuditLog.create({
          data: {
            userId: user.id,
            event: 'PASSWORD_RESET_REQUESTED',
            ipAddress: meta?.ip,
            userAgent: meta?.userAgent,
          },
        });
      });

      // Dispatch email (captured in memory in test/dev)
      try {
        await this.mailer.sendPasswordResetEmail(user.email, resetToken, env.PASSWORD_RESET_URL);
      } catch (err) {
        console.error('Password reset email dispatch failure:', err);
      }
    }
  }

  /**
   * Confirms password reset with token and new password.
   * Single-use, atomic update, and revokes all user sessions.
   */
  async confirmPasswordReset(
    input: PasswordResetConfirmInput,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    const tokenHash = hashToken(input.token);
    const resetRecord = await this.db.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !resetRecord ||
      resetRecord.usedAt !== null ||
      resetRecord.expiresAt.getTime() <= Date.now() ||
      resetRecord.user.status !== UserStatus.ACTIVE
    ) {
      throw new BadRequestError('Invalid or expired password reset token');
    }

    const newPasswordHash = await hashPassword(input.newPassword);

    await runInTransaction(this.db, async (tx) => {
      // 1. Mark token used atomically (count === 0 guards against concurrent token reuse)
      const updateResult = await tx.passwordResetToken.updateMany({
        where: { id: resetRecord.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      if (updateResult.count === 0) {
        throw new BadRequestError('Invalid or expired password reset token');
      }

      // 2. Invalidate any remaining outstanding reset tokens for this user
      await tx.passwordResetToken.updateMany({
        where: { userId: resetRecord.userId, usedAt: null },
        data: { usedAt: new Date() },
      });

      // 3. Update user's password
      await tx.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash: newPasswordHash },
      });

      // 4. Revoke all active sessions for this user (multi-device revocation)
      await tx.authSession.updateMany({
        where: { userId: resetRecord.userId, isRevoked: false },
        data: { isRevoked: true, revokedAt: new Date() },
      });

      // 5. Audit log
      await tx.authAuditLog.create({
        data: {
          userId: resetRecord.userId,
          event: 'PASSWORD_RESET_CONFIRMED',
          ipAddress: meta?.ip,
          userAgent: meta?.userAgent,
        },
      });
    });
  }

  /**
   * Retrieves the current authenticated user's profile and roles.
   */
  async getMe(userId: string): Promise<MeResponse> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        roles: true,
        ownerProfile: { select: { id: true } },
        driverProfile: { select: { id: true } },
      },
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    return formatMe(
      user,
      user.roles.map((r) => r.role),
      user.ownerProfile?.id,
      user.driverProfile?.id,
    );
  }

  /**
   * Updates current user's fullName and/or phone.
   */
  async updateMe(userId: string, input: UpdateMeInput): Promise<MeResponse> {
    const dataToUpdate: { fullName?: string; phone?: string | null } = {};
    if (input.fullName !== undefined) {
      dataToUpdate.fullName = input.fullName.trim();
    }
    if (input.phone !== undefined) {
      dataToUpdate.phone = input.phone?.trim() ?? null;
    }

    const updatedUser = await this.db.user.update({
      where: { id: userId },
      data: dataToUpdate,
      include: {
        roles: true,
        ownerProfile: { select: { id: true } },
        driverProfile: { select: { id: true } },
      },
    });

    return formatMe(
      updatedUser,
      updatedUser.roles.map((r) => r.role),
      updatedUser.ownerProfile?.id,
      updatedUser.driverProfile?.id,
    );
  }

  /**
   * Cleanup utility to purge expired revoked sessions and expired reset tokens older than retention policy.
   */
  async cleanupExpiredSessionsAndTokens(retentionDays = 30): Promise<{
    deletedSessions: number;
    deletedTokens: number;
  }> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const { count: deletedSessions } = await this.db.authSession.deleteMany({
      where: {
        isRevoked: true,
        expiresAt: { lt: cutoff },
      },
    });
    const { count: deletedTokens } = await this.db.passwordResetToken.deleteMany({
      where: {
        expiresAt: { lt: cutoff },
      },
    });
    return { deletedSessions, deletedTokens };
  }
}

export const authService = new AuthService();
