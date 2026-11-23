/**
 * Helpers to recognise PostgreSQL errors through Prisma's error wrappers.
 *
 * Raw queries surface as PrismaClientKnownRequestError P2010 with
 * `meta.code = '<SQLSTATE>'`; ORM operations may surface the SQLSTATE only in
 * the message. We check both so callers can rely on the database constraint as
 * the source of truth instead of read-then-write checks.
 */
export const PG_EXCLUSION_VIOLATION = '23P01';
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_CHECK_VIOLATION = '23514';
export const PG_DEADLOCK_DETECTED = '40P01';
export const PG_SERIALIZATION_FAILURE = '40001';

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  meta?: { code?: unknown; message?: unknown } | null;
}

function asErrorLike(error: unknown): ErrorLike | null {
  return typeof error === 'object' && error !== null ? (error as ErrorLike) : null;
}

/** Returns the PostgreSQL SQLSTATE carried by a Prisma/driver error, if any. */
export function getPgErrorCode(error: unknown): string | undefined {
  const e = asErrorLike(error);
  if (!e) return undefined;
  if (typeof e.meta?.code === 'string' && /^[0-9A-Z]{5}$/.test(e.meta.code)) return e.meta.code;
  const text = `${String(e.message ?? '')} ${String(e.meta?.message ?? '')}`;
  const match = /Code: `([0-9A-Z]{5})`/.exec(text) ?? /\b(23P01|23505|23514|40P01|40001)\b/.exec(text);
  if (match) return match[1];
  if (/conflicting key value violates exclusion constraint/i.test(text)) return PG_EXCLUSION_VIOLATION;
  return undefined;
}

/** Returns the violated constraint name when PostgreSQL reports one. */
export function getPgConstraintName(error: unknown): string | undefined {
  const e = asErrorLike(error);
  if (!e) return undefined;
  const text = `${String(e.message ?? '')} ${String(e.meta?.message ?? '')}`;
  return /constraint \\?"([^"\\]+)\\?"/.exec(text)?.[1];
}

export function isExclusionViolation(error: unknown, constraint?: string): boolean {
  if (getPgErrorCode(error) !== PG_EXCLUSION_VIOLATION) return false;
  if (!constraint) return true;
  const name = getPgConstraintName(error);
  return name === undefined || name === constraint;
}

/** Deadlocks / serialization failures (and Prisma's P2034) are safe to retry. */
export function isRetryableTransactionError(error: unknown): boolean {
  const e = asErrorLike(error);
  if (e?.code === 'P2034') return true;
  const code = getPgErrorCode(error);
  return code === PG_DEADLOCK_DETECTED || code === PG_SERIALIZATION_FAILURE;
}
