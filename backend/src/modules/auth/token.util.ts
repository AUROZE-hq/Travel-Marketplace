import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export interface JwtUserPayload {
  sub: string;
  email: string;
  roles: string[];
  sid: string; // Session ID reference for stateful revocation checks
}

/**
 * Parses JWT expiry string (e.g. '15m', '1h', '900s') into seconds.
 */
export function parseExpirySeconds(expiry: string): number {
  const match = /^(\d+)([smhd])?$/.exec(expiry);
  if (!match) return 900; // default 15 minutes
  const value = parseInt(match[1]!, 10);
  const unit = match[2] ?? 's';
  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 900;
  }
}

/**
 * Generates a short-lived access JWT bound to a specific session ID.
 */
export function signAccessToken(payload: JwtUserPayload): {
  token: string;
  expiresIn: number;
} {
  const expiresIn = parseExpirySeconds(env.JWT_ACCESS_EXPIRY);
  const token = jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      roles: payload.roles,
      sid: payload.sid,
    },
    env.JWT_SECRET,
    {
      algorithm: 'HS256',
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      expiresIn,
    },
  );
  return { token, expiresIn };
}

/**
 * Verifies and decodes an access JWT with explicit algorithm, issuer, audience, and session validation.
 */
export function verifyAccessToken(token: string): JwtUserPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  }) as jwt.JwtPayload;

  if (
    !decoded.sub ||
    typeof decoded.sub !== 'string' ||
    !decoded.email ||
    typeof decoded.email !== 'string' ||
    !decoded.sid ||
    typeof decoded.sid !== 'string' ||
    !Array.isArray(decoded.roles)
  ) {
    throw new Error('Invalid token claims: missing required identity fields or session reference');
  }

  return {
    sub: decoded.sub,
    email: decoded.email,
    roles: decoded.roles as string[],
    sid: decoded.sid,
  };
}

/**
 * Generates a cryptographically secure random opaque token.
 */
export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

/**
 * Hashes an opaque token using SHA-256 for persistent database storage.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Computes refresh token expiration date.
 */
export function getRefreshTokenExpiresAt(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Computes password reset token expiration date.
 */
export function getPasswordResetTokenExpiresAt(): Date {
  return new Date(Date.now() + env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);
}
