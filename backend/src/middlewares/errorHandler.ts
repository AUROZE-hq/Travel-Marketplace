import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  void next;
  console.error(error);
  response.status(503).json({
    success: false,
    message: 'Service is not ready',
  });
};
