import { Router } from 'express';
import * as daoController from '@/features/dao/dao.controller';
import { createDaoSchema, getDaoSchema, listDaoSchema, updateDaoSchema } from '@/features/dao/dao.schema';
import { requireAuth } from '@/shared/middlewares/auth.middleware';
import { validateRequest } from '@/shared/middlewares/validate-request.middleware';

export const daoRouter = Router();

daoRouter.get('/', validateRequest(listDaoSchema), daoController.list);
daoRouter.post('/', requireAuth, validateRequest(createDaoSchema), daoController.create);
daoRouter.get('/:daoId', validateRequest(getDaoSchema), daoController.getById);
daoRouter.patch('/:daoId', requireAuth, validateRequest(updateDaoSchema), daoController.update);
