import { Router } from 'express';
import * as daoController from '@/features/dao/dao.controller';
import {
  createDaoOnchainSchema,
  createDaoSchema,
  getDaoSchema,
  listDaoSchema,
  prepareCommunityMintSchema,
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
daoRouter.get('/:daoId', validateRequest(getDaoSchema), daoController.getById);
daoRouter.patch('/:daoId', requireAuth, validateRequest(updateDaoSchema), daoController.update);
