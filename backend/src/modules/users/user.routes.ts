import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { userController } from './user.controller.js';

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get('/me', userController.getMe);
userRouter.patch('/me', userController.updateMe);
