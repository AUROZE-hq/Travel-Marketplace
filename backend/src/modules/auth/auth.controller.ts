import type { Request, Response } from 'express';
import { authService, type AuthService } from './auth.service.js';
import { clearRefreshCookie, refreshTokenFromCookie, requireTrustedCookieOrigin, setRefreshCookie } from './refreshCookie.js';
import {
  loginSchema,
  logoutSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  refreshTokenSchema,
  registerSchema,
} from './auth.validation.js';

export class AuthController {
  constructor(private readonly service: AuthService = authService) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const input = registerSchema.parse(req.body);
    const meta = {
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    };

    const session = await this.service.register(input, meta);
    setRefreshCookie(res, session.refreshToken);
    res.status(201).json({ data: session });
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const input = loginSchema.parse(req.body);
    const meta = {
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    };

    const session = await this.service.login(input, meta);
    setRefreshCookie(res, session.refreshToken);
    res.status(200).json({ data: session });
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const cookieToken = refreshTokenFromCookie(req);
    const bodyToken = req.body?.refreshToken;
    if (!bodyToken && cookieToken) requireTrustedCookieOrigin(req);
    const input = refreshTokenSchema.parse({ refreshToken: bodyToken || cookieToken });
    const meta = {
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    };

    const session = await this.service.refresh(input, meta);
    setRefreshCookie(res, session.refreshToken);
    res.status(200).json({ data: session });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    const cookieToken = refreshTokenFromCookie(req);
    const bodyToken = req.body?.refreshToken;
    if (!bodyToken && cookieToken) requireTrustedCookieOrigin(req);
    const input = logoutSchema.parse({ refreshToken: bodyToken || cookieToken });
    await this.service.logout(req.user!.id, input);
    clearRefreshCookie(res);
    res.status(204).send();
  };

  requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
    const input = passwordResetRequestSchema.parse(req.body);
    const meta = {
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    };

    await this.service.requestPasswordReset(input, meta);
    res.status(202).send();
  };

  confirmPasswordReset = async (req: Request, res: Response): Promise<void> => {
    const input = passwordResetConfirmSchema.parse(req.body);
    const meta = {
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    };

    await this.service.confirmPasswordReset(input, meta);
    res.status(204).send();
  };
}

export const authController = new AuthController();
