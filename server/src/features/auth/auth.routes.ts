import { Router } from 'express';
import * as authController from '@/features/auth/auth.controller';
import { loginSchema, refreshSchema, registerSchema } from '@/features/auth/auth.schema';
import { requireAuth } from '@/shared/middlewares/auth.middleware';
import { validateRequest } from '@/shared/middlewares/validate-request.middleware';

export const authRouter = Router();

authRouter.post('/register', validateRequest(registerSchema), authController.register);
authRouter.post('/login', validateRequest(loginSchema), authController.login);
authRouter.post('/refresh', validateRequest(refreshSchema), authController.refresh);
authRouter.get('/me', requireAuth, authController.me);
