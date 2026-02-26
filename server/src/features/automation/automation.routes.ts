import { Router } from 'express';
import * as automationController from '@/features/automation/automation.controller';
import { processNextExecutionSchema, syncExecutionQueueSchema } from '@/features/automation/automation.schema';
import { requireAuth } from '@/shared/middlewares/auth.middleware';
import { validateRequest } from '@/shared/middlewares/validate-request.middleware';

export const automationRouter = Router();

automationRouter.post('/sync', requireAuth, validateRequest(syncExecutionQueueSchema), automationController.syncQueue);
automationRouter.post(
  '/process-next',
  requireAuth,
  validateRequest(processNextExecutionSchema),
  automationController.processNext,
);
