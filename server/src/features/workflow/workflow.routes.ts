import { Router } from 'express';
import * as workflowController from '@/features/workflow/workflow.controller';
import {
  createWorkflowRuleSchema,
  evaluateWorkflowRulesSchema,
  getWorkflowRuleSchema,
  listWorkflowEventSchema,
  listWorkflowRuleSchema,
  updateWorkflowRuleSchema,
} from '@/features/workflow/workflow.schema';
import { requireAuth } from '@/shared/middlewares/auth.middleware';
import { validateRequest } from '@/shared/middlewares/validate-request.middleware';

export const workflowRouter = Router();

workflowRouter.get('/', requireAuth, validateRequest(listWorkflowRuleSchema), workflowController.list);
workflowRouter.post('/', requireAuth, validateRequest(createWorkflowRuleSchema), workflowController.create);
workflowRouter.post('/evaluate', requireAuth, validateRequest(evaluateWorkflowRulesSchema), workflowController.evaluateNow);
workflowRouter.get('/:workflowRuleId', requireAuth, validateRequest(getWorkflowRuleSchema), workflowController.getById);
workflowRouter.patch('/:workflowRuleId', requireAuth, validateRequest(updateWorkflowRuleSchema), workflowController.update);
workflowRouter.get(
  '/:workflowRuleId/events',
  requireAuth,
  validateRequest(listWorkflowEventSchema),
  workflowController.listEvents,
);
