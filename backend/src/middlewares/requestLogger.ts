import type { RequestHandler } from 'express';

export const requestLogger: RequestHandler = (request, _response, next) => {
  const startedAt = Date.now();
  next();
  console.info(`${request.method} ${request.originalUrl} ${Date.now() - startedAt}ms`);
};
