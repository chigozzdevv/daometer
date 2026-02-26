import type { Request, Response } from 'express';
import { AppError } from '@/shared/errors/app-error';
import { assertAdminUser } from '@/shared/utils/authorization.util';
import { asyncHandler } from '@/shared/utils/async-handler.util';
import { processNextExecutionJob, synchronizeExecutionQueue } from '@/features/automation/automation.service';

export const syncQueue = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  await assertAdminUser(req.authUser.userId);
  const result = await synchronizeExecutionQueue();

  res.status(200).json({
    success: true,
    data: result,
  });
});

export const processNext = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  await assertAdminUser(req.authUser.userId);
  const workerId = `manual-${req.authUser.userId.toString()}`;
  const result = await processNextExecutionJob(workerId);

  res.status(200).json({
    success: true,
    data: result,
  });
});
