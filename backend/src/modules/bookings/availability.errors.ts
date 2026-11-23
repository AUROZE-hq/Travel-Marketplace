import { DomainError } from '../../shared/errors/DomainError.js';

/** The vehicle already has an overlapping block, hold or booking (exclusion constraint). */
export class VehicleUnavailableError extends DomainError {
  constructor(details?: unknown) {
    super('VEHICLE_UNAVAILABLE', 'The vehicle is not available for the requested time', 409, details);
  }
}

/** The vehicle is not approved, not active, or has no approved driver (rule 8). */
export class VehicleNotBookableError extends DomainError {
  constructor(details?: unknown) {
    super('VEHICLE_NOT_BOOKABLE', 'The vehicle is not currently bookable', 409, details);
  }
}

export class QuotationNotAcceptableError extends DomainError {
  constructor(status: string) {
    super('QUOTATION_NOT_ACCEPTABLE', `Quotation cannot be accepted in status ${status}`, 409, {
      status,
    });
  }
}

export class QuotationExpiredError extends DomainError {
  constructor() {
    super('QUOTATION_EXPIRED', 'The quotation has expired', 410);
  }
}

/** Payment arrived after the hold was released and the slot is no longer free. */
export class HoldExpiredError extends DomainError {
  constructor(details?: unknown) {
    super('HOLD_EXPIRED', 'The payment hold expired and the vehicle is no longer available', 409, details);
  }
}

/** The driver already has an overlapping active assignment (exclusion constraint). */
export class DriverUnavailableError extends DomainError {
  constructor(details?: unknown) {
    super('DRIVER_UNAVAILABLE', 'The driver already has an overlapping trip', 409, details);
  }
}

/** The driver is not linked to the booking's vehicle, or is not approved/active. */
export class DriverNotEligibleError extends DomainError {
  constructor(details?: unknown) {
    super('DRIVER_NOT_ELIGIBLE', 'The driver cannot be assigned to this booking', 422, details);
  }
}
