import type { Request, Response } from 'express';
import { AppError } from '@/shared/errors/app-error';
import { asyncHandler } from '@/shared/utils/async-handler.util';
import {
  createDao,
  getDaoById,
  listDaoGovernances,
  listDaos,
  prepareCommunityMintCreate,
  prepareDaoOnchainCreate,
  updateDao,
} from '@/features/dao/dao.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const dao = await createDao(req.body, req.authUser.userId);

  res.status(201).json({
    success: true,
    data: dao,
  });
});

export const createOnchain = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const result = await prepareDaoOnchainCreate(req.body, req.authUser.userId);

  res.status(201).json({
    success: true,
    data: result,
  });
});

export const prepareCommunityMint = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const result = await prepareCommunityMintCreate(req.body, req.authUser.userId);

  res.status(201).json({
    success: true,
    data: result,
  });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as { page: number; limit: number; search?: string };
  const result = await listDaos(query);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { daoId } = req.params as { daoId: string };
  const dao = await getDaoById(daoId);

  res.status(200).json({
    success: true,
    data: dao,
  });
});

export const listGovernances = asyncHandler(async (req: Request, res: Response) => {
  const { daoId } = req.params as { daoId: string };
  const { rpcUrl } = req.query as { rpcUrl?: string };
  const result = await listDaoGovernances(daoId, { rpcUrl });

  res.status(200).json({
    success: true,
    data: result,
  });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { daoId } = req.params as { daoId: string };
  const dao = await updateDao(daoId, req.body, req.authUser.userId);

  res.status(200).json({
    success: true,
    data: dao,
  });
});
