import { Router } from 'express';
import * as proposalController from '@/features/proposal/proposal.controller';
import {
  createProposalOnchainSchema,
  createProposalSchema,
  decideProposalManualApprovalSchema,
  getProposalSchema,
  listProposalSchema,
  syncProposalOnchainExecutionSchema,
  transitionProposalStateSchema,
  updateProposalOnchainExecutionSchema,
} from '@/features/proposal/proposal.schema';
import { requireAuth } from '@/shared/middlewares/auth.middleware';
import { validateRequest } from '@/shared/middlewares/validate-request.middleware';

export const proposalRouter = Router();

proposalRouter.post('/', requireAuth, validateRequest(createProposalSchema), proposalController.create);
proposalRouter.get('/dao/:daoId', validateRequest(listProposalSchema), proposalController.listByDao);
proposalRouter.get('/:proposalId', validateRequest(getProposalSchema), proposalController.getById);
proposalRouter.patch(
  '/:proposalId/state',
  requireAuth,
  validateRequest(transitionProposalStateSchema),
  proposalController.transitionState,
);
proposalRouter.patch(
  '/:proposalId/onchain-execution',
  requireAuth,
  validateRequest(updateProposalOnchainExecutionSchema),
  proposalController.updateOnchainExecution,
);
proposalRouter.post(
  '/:proposalId/onchain-create',
  requireAuth,
  validateRequest(createProposalOnchainSchema),
  proposalController.createOnchain,
);
proposalRouter.post(
  '/:proposalId/onchain-sync',
  requireAuth,
  validateRequest(syncProposalOnchainExecutionSchema),
  proposalController.syncOnchainExecution,
);
proposalRouter.post(
  '/:proposalId/manual-approval',
  requireAuth,
  validateRequest(decideProposalManualApprovalSchema),
  proposalController.decideManualApproval,
);
