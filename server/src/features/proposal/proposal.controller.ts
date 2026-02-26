import type { Request, Response } from 'express';
import { AppError } from '@/shared/errors/app-error';
import { asyncHandler } from '@/shared/utils/async-handler.util';
import {
  createProposal,
  createProposalOnchain,
  decideProposalManualApproval,
  getProposalById,
  listDaoProposals,
  syncProposalOnchainExecution,
  transitionProposalState,
  updateProposalOnchainExecution,
} from '@/features/proposal/proposal.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const proposal = await createProposal(req.body, req.authUser.userId);

  res.status(201).json({
    success: true,
    data: proposal,
  });
});

export const listByDao = asyncHandler(async (req: Request, res: Response) => {
  const { daoId } = req.params as { daoId: string };
  const query = req.query as unknown as { page: number; limit: number; state?: any };
  const result = await listDaoProposals(daoId, query);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { proposalId } = req.params as { proposalId: string };
  const proposal = await getProposalById(proposalId);

  res.status(200).json({
    success: true,
    data: proposal,
  });
});

export const transitionState = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { proposalId } = req.params as { proposalId: string };
  const proposal = await transitionProposalState(proposalId, req.body.state, req.body.executionError, req.authUser.userId);

  res.status(200).json({
    success: true,
    data: proposal,
  });
});

export const updateOnchainExecution = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { proposalId } = req.params as { proposalId: string };
  const proposal = await updateProposalOnchainExecution(proposalId, req.body, req.authUser.userId);

  res.status(200).json({
    success: true,
    data: proposal,
  });
});

export const syncOnchainExecution = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { proposalId } = req.params as { proposalId: string };
  const proposal = await syncProposalOnchainExecution(proposalId, req.body, req.authUser.userId);

  res.status(200).json({
    success: true,
    data: proposal,
  });
});

export const createOnchain = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { proposalId } = req.params as { proposalId: string };
  const result = await createProposalOnchain(proposalId, req.body, req.authUser.userId);

  res.status(201).json({
    success: true,
    data: result,
  });
});

export const decideManualApproval = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { proposalId } = req.params as { proposalId: string };
  const proposal = await decideProposalManualApproval(proposalId, req.body, req.authUser.userId);

  res.status(200).json({
    success: true,
    data: proposal,
  });
});
