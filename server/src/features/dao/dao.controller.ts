import type { Request, Response } from 'express';
import { AppError } from '@/shared/errors/app-error';
import { asyncHandler } from '@/shared/utils/async-handler.util';
import { createDao, getDaoById, listDaos, updateDao } from '@/features/dao/dao.service';

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
