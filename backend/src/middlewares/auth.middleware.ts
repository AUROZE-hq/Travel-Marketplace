import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Role, UserStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import {
  AccountDisabledError,
  ForbiddenError,
  UnauthenticatedError,
} from '../modules/auth/auth.errors.js';
import { verifyAccessToken } from '../modules/auth/token.util.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: Role[];
  status: UserStatus;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionId?: string;
    }
  }
}

/**
 * Validates Bearer access token, verifies session existence and revocation state,
 * and confirms that the associated account is ACTIVE.
 */
export const authenticate: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthenticatedError('Missing or invalid Authorization header'));
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return next(new UnauthenticatedError('Missing bearer token'));
  }

  try {
    const payload = verifyAccessToken(token);

    if (!payload.sid) {
      return next(new UnauthenticatedError('Invalid access token: missing session identifier'));
    }

    // Revalidate against database session: ensures revoked, logged out, or family-revoked
    // sessions cannot continue accessing protected routes even within the 15-minute token lifetime.
    const session = await prisma.authSession.findUnique({
      where: { id: payload.sid },
      include: {
        user: {
          include: { roles: true },
        },
      },
    });

    if (!session) {
      return next(new UnauthenticatedError('Session not found or has been revoked'));
    }

    if (session.isRevoked) {
      return next(new UnauthenticatedError('Session has been revoked'));
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      return next(new UnauthenticatedError('Session has expired'));
    }

    if (!session.user || session.user.id !== payload.sub) {
      return next(new UnauthenticatedError('Invalid session owner'));
    }

    if (session.user.status !== UserStatus.ACTIVE) {
      return next(new AccountDisabledError('Account is suspended or deactivated'));
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      roles: session.user.roles.map((r) => r.role),
      status: session.user.status,
    };
    req.sessionId = session.id;

    return next();
  } catch (error) {
    if (error instanceof UnauthenticatedError || error instanceof AccountDisabledError) {
      return next(error);
    }
    return next(new UnauthenticatedError('Invalid or expired access token'));
  }
};

/**
 * Enforces that the authenticated user possesses a specific role.
 */
export function requireRole(requiredRole: Role): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthenticatedError());
    }

    if (!req.user.roles.includes(requiredRole)) {
      return next(
        new ForbiddenError(`Forbidden: requires ${requiredRole} role`),
      );
    }

    return next();
  };
}

/**
 * Enforces that the authenticated user possesses at least one of the specified roles.
 */
export function requireAnyRole(allowedRoles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthenticatedError());
    }

    const hasRole = allowedRoles.some((role) => req.user!.roles.includes(role));
    if (!hasRole) {
      return next(new ForbiddenError('Forbidden: insufficient permissions'));
    }

    return next();
  };
}

/**
 * Allows access if the user has an override role (e.g. ADMIN) or is the owner of the resource.
 */
export function requireOwnershipOrRoles(
  getOwnerId: (req: Request) => string | undefined | Promise<string | undefined>,
  allowedRoles: Role[] = [Role.ADMIN],
): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthenticatedError());
    }

    const hasAllowedRole = allowedRoles.some((role) => req.user!.roles.includes(role));
    if (hasAllowedRole) {
      return next();
    }

    try {
      const ownerId = await getOwnerId(req);
      if (ownerId && req.user.id === ownerId) {
        return next();
      }
      return next(new ForbiddenError('Forbidden: you do not own this resource'));
    } catch (err) {
      return next(err);
    }
  };
}
