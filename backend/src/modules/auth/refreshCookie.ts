import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { ForbiddenError } from '../../shared/errors/DomainError.js';

const cookieName = 'tm_refresh';
const cookiePath = '/api/v1/auth';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: cookiePath,
  };
}

export function setRefreshCookie(response: Response, token: string): void {
  response.cookie(cookieName, token, {
    ...cookieOptions(),
    maxAge: env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(response: Response): void {
  response.clearCookie(cookieName, cookieOptions());
}

export function refreshTokenFromCookie(request: Request): string | null {
  const cookie = request.headers.cookie?.split(';').find((part) => part.trim().startsWith(`${cookieName}=`));
  return cookie?.trim().slice(cookieName.length + 1) || null;
}

export function requireTrustedCookieOrigin(request: Request): void {
  const origin = request.get('origin');
  if (origin && origin !== env.FRONTEND_URL) {
    throw new ForbiddenError('Untrusted origin');
  }
}
