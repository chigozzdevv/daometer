import type { Request, Response } from 'express';
import { AppError } from '@/shared/errors/app-error';
import { asyncHandler } from '@/shared/utils/async-handler.util';
import {
  createWorkflowRule,
  getWorkflowRuleById,
  listWorkflowEvents,
  listWorkflowRules,
  runWorkflowEvaluationManually,
  updateWorkflowRule,
} from '@/features/workflow/workflow.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const workflowRule = await createWorkflowRule(req.body, req.authUser.userId);

  res.status(201).json({
    success: true,
    data: workflowRule,
  });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const query = req.query as unknown as {
    flowId: string;
    enabled?: boolean;
    page: number;
    limit: number;
  };

  const result = await listWorkflowRules(query, req.authUser.userId);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { workflowRuleId } = req.params as { workflowRuleId: string };
  const workflowRule = await getWorkflowRuleById(workflowRuleId, req.authUser.userId);

  res.status(200).json({
    success: true,
    data: workflowRule,
  });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { workflowRuleId } = req.params as { workflowRuleId: string };
  const workflowRule = await updateWorkflowRule(workflowRuleId, req.body, req.authUser.userId);

  res.status(200).json({
    success: true,
    data: workflowRule,
  });
});

export const listEvents = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { workflowRuleId } = req.params as { workflowRuleId: string };
  const query = req.query as unknown as { page: number; limit: number };
  const result = await listWorkflowEvents(
    {
      workflowRuleId,
      page: query.page,
      limit: query.limit,
    },
    req.authUser.userId,
  );

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
});

export const evaluateNow = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const result = await runWorkflowEvaluationManually(req.authUser.userId);

  res.status(200).json({
    success: true,
    data: result,
  });
});
