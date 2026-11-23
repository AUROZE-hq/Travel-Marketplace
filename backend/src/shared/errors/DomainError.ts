/**
 * Base class for expected business-rule failures. `code` is the stable,
 * machine-readable error code used in the API error envelope:
 *   { "error": { "code": "VEHICLE_UNAVAILABLE", "message": "...", "details": [...] } }
 * `httpStatus` is the status the (Stage 3) HTTP error handler should use.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 422, details);
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id?: string) {
    super('NOT_FOUND', `${entity} not found`, 404, id ? { entity, id } : { entity });
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'You are not allowed to perform this action') {
    super('FORBIDDEN', message, 403);
  }
}

export class InvalidStateError extends DomainError {
  constructor(message: string, details?: unknown) {
    super('INVALID_STATE', message, 409, details);
  }
}
