import { Router } from 'express';
import * as daoController from '@/features/dao/dao.controller';
import {
  createDaoOnchainSchema,
  createDaoSchema,
  getDaoSchema,
  listDaoGovernancesSchema,
  listDaoSchema,
  prepareMintAuthoritySchema,
  prepareMintDistributionSchema,
  prepareGovernanceCreateSchema,
  prepareCommunityMintSchema,
  prepareVotingDelegateSchema,
  prepareVotingDepositSchema,
  prepareVotingWithdrawSchema,
  updateDaoSchema,
} from '@/features/dao/dao.schema';
import { requireAuth } from '@/shared/middlewares/auth.middleware';
import { validateRequest } from '@/shared/middlewares/validate-request.middleware';

export const daoRouter = Router();

daoRouter.get('/', validateRequest(listDaoSchema), daoController.list);
daoRouter.post('/', requireAuth, validateRequest(createDaoSchema), daoController.create);
daoRouter.post('/onchain-create', requireAuth, validateRequest(createDaoOnchainSchema), daoController.createOnchain);
daoRouter.post(
  '/prepare-community-mint',
  requireAuth,
  validateRequest(prepareCommunityMintSchema),
  daoController.prepareCommunityMint,
);
daoRouter.post(
  '/:daoId/prepare-governance',
  requireAuth,
  validateRequest(prepareGovernanceCreateSchema),
  daoController.prepareGovernance,
);
daoRouter.post(
  '/:daoId/prepare-mint-distribution',
  requireAuth,
  validateRequest(prepareMintDistributionSchema),
  daoController.prepareMintDistributionTx,
);
daoRouter.post(
  '/:daoId/prepare-mint-authority',
  requireAuth,
  validateRequest(prepareMintAuthoritySchema),
  daoController.prepareMintAuthorityTx,
);
daoRouter.post(
  '/:daoId/prepare-voting-deposit',
  requireAuth,
  validateRequest(prepareVotingDepositSchema),
  daoController.prepareVotingDepositTx,
);
daoRouter.post(
  '/:daoId/prepare-voting-withdraw',
  requireAuth,
  validateRequest(prepareVotingWithdrawSchema),
  daoController.prepareVotingWithdrawTx,
);
daoRouter.post(
  '/:daoId/prepare-voting-delegate',
  requireAuth,
  validateRequest(prepareVotingDelegateSchema),
  daoController.prepareVotingDelegateTx,
);
daoRouter.get('/:daoId/governances', validateRequest(listDaoGovernancesSchema), daoController.listGovernances);
daoRouter.get('/:daoId', validateRequest(getDaoSchema), daoController.getById);
daoRouter.patch('/:daoId', requireAuth, validateRequest(updateDaoSchema), daoController.update);
