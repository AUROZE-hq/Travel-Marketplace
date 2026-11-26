import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authController } from './auth.controller.js';
import { createRateLimiter } from './rateLimiter.js';

export const authRouter = Router();

// Rate limiters for sensitive endpoints
const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many login attempts, please try again after 15 minutes',
});

const registerRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many registration attempts, please try again later',
});

const refreshRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: 'Too many refresh attempts, please try again later',
});

const resetRequestRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many password reset requests, please try again later',
});

const resetConfirmRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many password reset confirmation attempts, please try again later',
});

// Routes
authRouter.post('/register', registerRateLimiter, authController.register);
authRouter.post('/login', loginRateLimiter, authController.login);
authRouter.post('/refresh', refreshRateLimiter, authController.refresh);
authRouter.post('/logout', authenticate, authController.logout);
authRouter.post('/password-reset/request', resetRequestRateLimiter, authController.requestPasswordReset);
authRouter.post('/password-reset/confirm', resetConfirmRateLimiter, authController.confirmPasswordReset);
