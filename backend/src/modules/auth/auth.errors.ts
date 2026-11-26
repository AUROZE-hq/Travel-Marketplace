import { DomainError } from '../../shared/errors/DomainError.js';

export class UnauthenticatedError extends DomainError {
  constructor(message = 'Authentication required') {
    super('UNAUTHENTICATED', message, 401);
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor(message = 'Invalid email or password') {
    super('UNAUTHENTICATED', message, 401);
  }
}

export class AccountDisabledError extends DomainError {
  constructor(message = 'Account is suspended or deactivated') {
    super('UNAUTHENTICATED', message, 401);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'You are not allowed to perform this action') {
    super('FORBIDDEN', message, 403);
  }
}

export class DuplicateEmailError extends DomainError {
  constructor(message = 'An account with this email already exists') {
    super('CONFLICT', message, 409);
  }
}

export class BadRequestError extends DomainError {
  constructor(message: string, code = 'BAD_REQUEST', details?: unknown) {
    super(code, message, 400, details);
  }
}

export class RateLimitedError extends DomainError {
  constructor(message = 'Too many requests, please try again later') {
    super('RATE_LIMITED', message, 429);
  }
}
