import type { Request, Response, NextFunction } from 'express';
import { checkDatabaseReadiness, getHealthStatus } from '../services/healthService.js';

export function health(_request: Request, response: Response) {
  response.status(200).json(getHealthStatus());
}

export async function readiness(_request: Request, response: Response, next: NextFunction) {
  try {
    response.status(200).json(await checkDatabaseReadiness());
  } catch (error) {
    next(error);
  }
}
