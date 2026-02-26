import { Router } from 'express';
import * as flowController from '@/features/flow/flow.controller';
import {
  compileFlowSchema,
  compileInlineFlowSchema,
  createFlowSchema,
  getFlowSchema,
  listFlowSchema,
  publishFlowSchema,
  updateFlowSchema,
} from '@/features/flow/flow.schema';
import { requireAuth } from '@/shared/middlewares/auth.middleware';
import { validateRequest } from '@/shared/middlewares/validate-request.middleware';

export const flowRouter = Router();

flowRouter.get('/', validateRequest(listFlowSchema), flowController.list);
flowRouter.post('/', requireAuth, validateRequest(createFlowSchema), flowController.create);
flowRouter.post('/compile-inline', requireAuth, validateRequest(compileInlineFlowSchema), flowController.compileInline);
flowRouter.get('/:flowId', validateRequest(getFlowSchema), flowController.getById);
flowRouter.patch('/:flowId', requireAuth, validateRequest(updateFlowSchema), flowController.update);
flowRouter.post('/:flowId/compile', requireAuth, validateRequest(compileFlowSchema), flowController.compile);
flowRouter.post('/:flowId/publish', requireAuth, validateRequest(publishFlowSchema), flowController.publish);
