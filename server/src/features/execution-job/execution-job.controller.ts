import type { Request, Response } from 'express';
import { AppError } from '@/shared/errors/app-error';
import { assertAdminUser } from '@/shared/utils/authorization.util';
import { asyncHandler } from '@/shared/utils/async-handler.util';
import {
  listExecutionJobs,
  retryExecutionJob,
  scheduleExecutionJobFromProposal,
} from '@/features/execution-job/execution-job.service';
import { getProposalById } from '@/features/proposal/proposal.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  await assertAdminUser(req.authUser.userId);
  const query = req.query as unknown as { page: number; limit: number; status?: any; daoId?: string };
  const result = await listExecutionJobs(query);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
});

export const scheduleFromProposal = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  await assertAdminUser(req.authUser.userId);
  const { proposalId } = req.params as { proposalId: string };
  const proposal = await getProposalById(proposalId);
  const executionJob = await scheduleExecutionJobFromProposal(proposal);

  res.status(200).json({
    success: true,
    data: executionJob,
  });
});

export const retry = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  await assertAdminUser(req.authUser.userId);
  const { executionJobId } = req.params as { executionJobId: string };
  const executionJob = await retryExecutionJob(executionJobId);

  res.status(200).json({
    success: true,
    data: executionJob,
  });
});
