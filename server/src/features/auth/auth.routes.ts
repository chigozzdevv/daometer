import { Router } from 'express';
import * as authController from '@/features/auth/auth.controller';
import { createChallengeSchema, refreshSchema, verifyChallengeSchema } from '@/features/auth/auth.schema';
import { requireAuth } from '@/shared/middlewares/auth.middleware';
import { validateRequest } from '@/shared/middlewares/validate-request.middleware';

export const authRouter = Router();

authRouter.post('/challenge', validateRequest(createChallengeSchema), authController.challenge);
authRouter.post('/verify', validateRequest(verifyChallengeSchema), authController.verify);
authRouter.post('/refresh', validateRequest(refreshSchema), authController.refresh);
authRouter.get('/me', requireAuth, authController.me);
