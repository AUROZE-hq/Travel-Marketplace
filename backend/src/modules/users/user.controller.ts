import type { Request, Response } from 'express';
import { authService, type AuthService } from '../auth/auth.service.js';
import { updateMeSchema } from '../auth/auth.validation.js';

export class UserController {
  constructor(private readonly service: AuthService = authService) {}

  getMe = async (req: Request, res: Response): Promise<void> => {
    const me = await this.service.getMe(req.user!.id);
    res.status(200).json({ data: me });
  };

  updateMe = async (req: Request, res: Response): Promise<void> => {
    const input = updateMeSchema.parse(req.body);
    const updated = await this.service.updateMe(req.user!.id, input);
    res.status(200).json({ data: updated });
  };
}

export const userController = new UserController();
