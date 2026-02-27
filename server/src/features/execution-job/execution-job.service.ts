import { Types } from 'mongoose';
import { env } from '@/config/env.config';
import { ExecutionJobModel, type ExecutionJobDocument } from '@/features/execution-job/execution-job.model';
import type { ProposalDocument } from '@/features/proposal/proposal.model';
import { AppError } from '@/shared/errors/app-error';

export const scheduleExecutionJobFromProposal = async (
  proposal: ProposalDocument,
  now = new Date(),
): Promise<ExecutionJobDocument | null> => {
  if (proposal.state !== 'succeeded') {
    return null;
  }

  if (!proposal.automation.autoExecute) {
    return null;
  }

  if (proposal.executedAt) {
    return null;
  }

  if (proposal.riskScore > proposal.automation.maxRiskScore) {
    return null;
  }

  const readyAt =
    proposal.automation.executeAfterHoldUp && proposal.succeededAt
      ? new Date(proposal.succeededAt.getTime() + proposal.holdUpSeconds * 1000)
      : now;

  const existingJob = await ExecutionJobModel.findOne({ proposalId: proposal._id });

  if (!existingJob) {
    return ExecutionJobModel.create({
      daoId: proposal.daoId,
      proposalId: proposal._id,
      status: 'pending',
      maxRetries: env.WORKER_MAX_RETRIES,
      nextRunAt: readyAt,
    });
  }

  if (existingJob.status === 'completed') {
    return existingJob;
  }

  if (existingJob.status === 'running') {
    return existingJob;
  }

  if (existingJob.status === 'failed') {
    return existingJob;
  }

  existingJob.status = 'pending';
  existingJob.nextRunAt = readyAt;
  existingJob.lockedBy = null;
  existingJob.lockExpiresAt = null;
  await existingJob.save();

  return existingJob;
};

export const claimNextExecutionJob = async (workerId: string): Promise<ExecutionJobDocument | null> => {
  const now = new Date();
  const lockExpiresAt = new Date(now.getTime() + env.WORKER_LOCK_TIMEOUT_MS);

  return ExecutionJobModel.findOneAndUpdate(
    {
      status: 'pending',
      nextRunAt: { $lte: now },
      $or: [{ lockExpiresAt: null }, { lockExpiresAt: { $lte: now } }],
    },
    {
      $set: {
        status: 'running',
        lockedBy: workerId,
        lockExpiresAt,
      },
    },
    {
      new: true,
      sort: { nextRunAt: 1, createdAt: 1 },
    },
  );
};

export const releaseExpiredJobLocks = async (): Promise<number> => {
  const now = new Date();

  const result = await ExecutionJobModel.updateMany(
    {
      status: 'running',
      lockExpiresAt: { $lte: now },
    },
    {
      $set: {
        status: 'pending',
        lockedBy: null,
        lockExpiresAt: null,
        nextRunAt: now,
      },
    },
  );

  return result.modifiedCount;
};

export const renewExecutionJobLock = async (executionJobId: Types.ObjectId, workerId: string): Promise<boolean> => {
  const lockExpiresAt = new Date(Date.now() + env.WORKER_LOCK_TIMEOUT_MS);

  const result = await ExecutionJobModel.updateOne(
    {
      _id: executionJobId,
      status: 'running',
      lockedBy: workerId,
    },
    {
      $set: { lockExpiresAt },
    },
  );

  return result.modifiedCount === 1;
};

export const completeExecutionJob = async (
  executionJobId: Types.ObjectId,
  executionReference: string,
  workerId?: string,
): Promise<ExecutionJobDocument> => {
  const executionJob = await ExecutionJobModel.findOne(
    workerId ? { _id: executionJobId, status: 'running', lockedBy: workerId } : { _id: executionJobId },
  );

  if (!executionJob) {
    throw new AppError(
      workerId ? 'Execution job lock lost' : 'Execution job not found',
      workerId ? 409 : 404,
      workerId ? 'EXECUTION_JOB_LOCK_LOST' : 'EXECUTION_JOB_NOT_FOUND',
    );
  }

  executionJob.status = 'completed';
  executionJob.completedAt = new Date();
  executionJob.executionReference = executionReference;
  executionJob.lastError = null;
  executionJob.lockedBy = null;
  executionJob.lockExpiresAt = null;
  await executionJob.save();

  return executionJob;
};

export const failExecutionJob = async (
  executionJobId: Types.ObjectId,
  errorMessage: string,
  workerId?: string,
): Promise<ExecutionJobDocument> => {
  const executionJob = await ExecutionJobModel.findOne(
    workerId ? { _id: executionJobId, status: 'running', lockedBy: workerId } : { _id: executionJobId },
  );

  if (!executionJob) {
    throw new AppError(
      workerId ? 'Execution job lock lost' : 'Execution job not found',
      workerId ? 409 : 404,
      workerId ? 'EXECUTION_JOB_LOCK_LOST' : 'EXECUTION_JOB_NOT_FOUND',
    );
  }

  const nextAttempt = executionJob.attemptCount + 1;

  executionJob.attemptCount = nextAttempt;
  executionJob.lastError = errorMessage;
  executionJob.lockedBy = null;
  executionJob.lockExpiresAt = null;

  if (nextAttempt >= executionJob.maxRetries) {
    executionJob.status = 'failed';
  } else {
    executionJob.status = 'pending';
    executionJob.nextRunAt = new Date(Date.now() + env.WORKER_RETRY_DELAY_MS);
  }

  await executionJob.save();

  return executionJob;
};

export const failExecutionJobPermanently = async (
  executionJobId: Types.ObjectId,
  errorMessage: string,
  workerId?: string,
): Promise<ExecutionJobDocument> => {
  const executionJob = await ExecutionJobModel.findOne(
    workerId ? { _id: executionJobId, status: 'running', lockedBy: workerId } : { _id: executionJobId },
  );

  if (!executionJob) {
    throw new AppError(
      workerId ? 'Execution job lock lost' : 'Execution job not found',
      workerId ? 409 : 404,
      workerId ? 'EXECUTION_JOB_LOCK_LOST' : 'EXECUTION_JOB_NOT_FOUND',
    );
  }

  executionJob.status = 'failed';
  executionJob.lastError = errorMessage;
  executionJob.attemptCount = executionJob.maxRetries;
  executionJob.lockedBy = null;
  executionJob.lockExpiresAt = null;
  await executionJob.save();

  return executionJob;
};

export const rescheduleExecutionJob = async (
  executionJobId: Types.ObjectId,
  nextRunAt: Date,
  reason?: string,
  workerId?: string,
): Promise<ExecutionJobDocument> => {
  const executionJob = await ExecutionJobModel.findOne(
    workerId ? { _id: executionJobId, status: 'running', lockedBy: workerId } : { _id: executionJobId },
  );

  if (!executionJob) {
    throw new AppError(
      workerId ? 'Execution job lock lost' : 'Execution job not found',
      workerId ? 409 : 404,
      workerId ? 'EXECUTION_JOB_LOCK_LOST' : 'EXECUTION_JOB_NOT_FOUND',
    );
  }

  executionJob.status = 'pending';
  executionJob.nextRunAt = nextRunAt;
  executionJob.lockedBy = null;
  executionJob.lockExpiresAt = null;
  executionJob.lastError = reason ?? executionJob.lastError;
  await executionJob.save();

  return executionJob;
};

export const retryExecutionJob = async (executionJobId: string): Promise<ExecutionJobDocument> => {
  const executionJob = await ExecutionJobModel.findById(executionJobId);

  if (!executionJob) {
    throw new AppError('Execution job not found', 404, 'EXECUTION_JOB_NOT_FOUND');
  }

  if (executionJob.status !== 'failed') {
    throw new AppError('Only failed jobs can be retried', 400, 'INVALID_EXECUTION_JOB_STATUS');
  }

  executionJob.status = 'pending';
  executionJob.nextRunAt = new Date();
  executionJob.lockedBy = null;
  executionJob.lockExpiresAt = null;
  executionJob.lastError = null;
  executionJob.attemptCount = 0;
  await executionJob.save();

  return executionJob;
};

export const listExecutionJobs = async (
  options: {
    page: number;
    limit: number;
    status?: 'pending' | 'running' | 'completed' | 'failed';
    daoId?: string;
  },
): Promise<{
  items: ExecutionJobDocument[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> => {
  const filter: {
    status?: 'pending' | 'running' | 'completed' | 'failed';
    daoId?: Types.ObjectId;
  } = {};

  if (options.status) {
    filter.status = options.status;
  }

  if (options.daoId) {
    filter.daoId = new Types.ObjectId(options.daoId);
  }

  const skip = (options.page - 1) * options.limit;

  const [items, total] = await Promise.all([
    ExecutionJobModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(options.limit),
    ExecutionJobModel.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages: Math.ceil(total / options.limit),
    },
  };
};
