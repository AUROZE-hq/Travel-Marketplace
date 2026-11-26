import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { DomainError } from '../shared/errors/DomainError.js';

export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  void next;

  // 1. Domain errors (explicit business rule failures, authentication, authorization, not found)
  if (error instanceof DomainError) {
    response.status(error.httpStatus).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  // 2. Zod validation errors
  if (error instanceof ZodError) {
    const details = error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    response.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details,
      },
    });
    return;
  }

  // 3. Fallback / unexpected internal server errors
  console.error('Unhandled Server Error:', error);
  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred',
    },
  });
};
