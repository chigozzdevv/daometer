import { Router } from 'express';
import * as executionJobController from '@/features/execution-job/execution-job.controller';
import {
  listExecutionJobSchema,
  retryExecutionJobSchema,
  scheduleExecutionJobSchema,
} from '@/features/execution-job/execution-job.schema';
import { requireAuth } from '@/shared/middlewares/auth.middleware';
import { validateRequest } from '@/shared/middlewares/validate-request.middleware';

export const executionJobRouter = Router();

executionJobRouter.get('/', requireAuth, validateRequest(listExecutionJobSchema), executionJobController.list);
executionJobRouter.post(
  '/schedule/:proposalId',
  requireAuth,
  validateRequest(scheduleExecutionJobSchema),
  executionJobController.scheduleFromProposal,
);
executionJobRouter.post(
  '/:executionJobId/retry',
  requireAuth,
  validateRequest(retryExecutionJobSchema),
  executionJobController.retry,
);
