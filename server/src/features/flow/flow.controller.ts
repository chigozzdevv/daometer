import type { Request, Response } from 'express';
import {
  createFlowBlock,
  deleteFlowBlock,
  listFlowBlocks,
  updateFlowBlock,
} from '@/features/flow/flow-block.service';
import { AppError } from '@/shared/errors/app-error';
import { asyncHandler } from '@/shared/utils/async-handler.util';
import {
  compileFlow,
  compileInlineFlow,
  createFlow,
  getFlowById,
  listFlows,
  publishFlow,
  updateFlow,
} from '@/features/flow/flow.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const flow = await createFlow(req.body, req.authUser.userId);

  res.status(201).json({
    success: true,
    data: flow,
  });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as {
    page: number;
    limit: number;
    daoId?: string;
    status?: 'draft' | 'published' | 'archived';
    search?: string;
  };

  const result = await listFlows(query);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { flowId } = req.params as { flowId: string };
  const flow = await getFlowById(flowId);

  res.status(200).json({
    success: true,
    data: flow,
  });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { flowId } = req.params as { flowId: string };
  const flow = await updateFlow(flowId, req.body, req.authUser.userId);

  res.status(200).json({
    success: true,
    data: flow,
  });
});

export const compile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { flowId } = req.params as { flowId: string };
  const compilation = await compileFlow(flowId, req.authUser.userId, req.body.context ?? {});

  res.status(200).json({
    success: true,
    data: compilation,
  });
});

export const compileInline = asyncHandler(async (req: Request, res: Response) => {
  const compilation = compileInlineFlow(req.body.blocks, req.body.context ?? {});

  res.status(200).json({
    success: true,
    data: compilation,
  });
});

export const publish = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { flowId } = req.params as { flowId: string };
  const result = await publishFlow(flowId, req.authUser.userId, req.body);

  res.status(201).json({
    success: true,
    data: result,
  });
});

export const listBlocks = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { flowId } = req.params as { flowId: string };
  const blocks = await listFlowBlocks(flowId, req.authUser.userId);

  res.status(200).json({
    success: true,
    data: blocks,
  });
});

export const createBlock = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { flowId } = req.params as { flowId: string };
  const block = await createFlowBlock(flowId, req.body, req.authUser.userId);

  res.status(201).json({
    success: true,
    data: block,
  });
});

export const updateBlock = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { flowId, blockId } = req.params as { flowId: string; blockId: string };
  const block = await updateFlowBlock(flowId, blockId, req.body, req.authUser.userId);

  res.status(200).json({
    success: true,
    data: block,
  });
});

export const removeBlock = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { flowId, blockId } = req.params as { flowId: string; blockId: string };
  await deleteFlowBlock(flowId, blockId, req.authUser.userId);

  res.status(200).json({
    success: true,
    data: null,
  });
});
