import { DaoModel } from '@/features/dao/dao.model';
import {
  claimNextExecutionJob,
  completeExecutionJob,
  failExecutionJob,
  failExecutionJobPermanently,
  renewExecutionJobLock,
  rescheduleExecutionJob,
  scheduleExecutionJobFromProposal,
} from '@/features/execution-job/execution-job.service';
import {
  findAutoExecutionCandidates,
  getProposalById,
  markProposalExecutionFailed,
} from '@/features/proposal/proposal.service';
import { AppError } from '@/shared/errors/app-error';

type QueueSyncResult = {
  candidateCount: number;
  scheduledCount: number;
  skippedCount: number;
};

type ProcessNextResult = {
  processed: boolean;
  status?: 'completed' | 'rescheduled' | 'failed' | 'skipped';
  executionJobId?: string;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected worker error';
};

export const synchronizeExecutionQueue = async (): Promise<QueueSyncResult> => {
  const proposals = await findAutoExecutionCandidates();

  if (proposals.length === 0) {
    return {
      candidateCount: 0,
      scheduledCount: 0,
      skippedCount: 0,
    };
  }

  const daoIds = [...new Set(proposals.map((proposal) => proposal.daoId.toString()))];
  const daos = await DaoModel.find({ _id: { $in: daoIds } }).select('automationConfig').lean();
  const daoMap = new Map(daos.map((dao) => [dao._id.toString(), dao]));

  let scheduledCount = 0;
  let skippedCount = 0;

  for (const proposal of proposals) {
    const dao = daoMap.get(proposal.daoId.toString());

    if (!dao?.automationConfig?.autoExecuteEnabled) {
      skippedCount += 1;
      continue;
    }

    const maxAllowedRiskScore = Math.min(dao.automationConfig.maxRiskScore ?? 100, proposal.automation.maxRiskScore);

    if (proposal.riskScore > maxAllowedRiskScore) {
      skippedCount += 1;
      continue;
    }

    const executionJob = await scheduleExecutionJobFromProposal(proposal);

    if (executionJob) {
      scheduledCount += 1;
    }
  }

  return {
    candidateCount: proposals.length,
    scheduledCount,
    skippedCount,
  };
};

export const processNextExecutionJob = async (workerId: string): Promise<ProcessNextResult> => {
  const executionJob = await claimNextExecutionJob(workerId);

  if (!executionJob) {
    return {
      processed: false,
    };
  }

  const heartbeat = async (): Promise<void> => {
    const lockRenewed = await renewExecutionJobLock(executionJob._id, workerId);

    if (!lockRenewed) {
      throw new AppError('Execution job lock lost', 409, 'EXECUTION_JOB_LOCK_LOST');
    }
  };

  try {
    await heartbeat();
    const proposal = await getProposalById(executionJob.proposalId.toString());

    if (proposal.state === 'executed') {
      await completeExecutionJob(
        executionJob._id,
        proposal.executionReference ?? `already-executed-${proposal.proposalAddress.slice(0, 8)}`,
        workerId,
      );
      return {
        processed: true,
        status: 'completed',
        executionJobId: executionJob.id,
      };
    }

    if (proposal.state !== 'succeeded') {
      await failExecutionJobPermanently(
        executionJob._id,
        `Proposal cannot be executed from ${proposal.state} state`,
        workerId,
      );
      return {
        processed: true,
        status: 'skipped',
        executionJobId: executionJob.id,
      };
    }

    const dao = await DaoModel.findById(proposal.daoId).select('automationConfig');

    if (!dao?.automationConfig.autoExecuteEnabled) {
      await failExecutionJobPermanently(executionJob._id, 'DAO automation is disabled', workerId);
      await markProposalExecutionFailed(proposal._id, 'DAO automation is disabled');
      return {
        processed: true,
        status: 'failed',
        executionJobId: executionJob.id,
      };
    }

    const maxAllowedRiskScore = Math.min(dao.automationConfig.maxRiskScore ?? 100, proposal.automation.maxRiskScore);

    if (proposal.riskScore > maxAllowedRiskScore) {
      await failExecutionJobPermanently(
        executionJob._id,
        'Proposal exceeds configured automation risk threshold',
        workerId,
      );
      await markProposalExecutionFailed(proposal._id, 'Risk threshold exceeded for automated execution');
      return {
        processed: true,
        status: 'failed',
        executionJobId: executionJob.id,
      };
    }

    const now = new Date();
    const readyAt =
      proposal.automation.executeAfterHoldUp && proposal.succeededAt
        ? new Date(proposal.succeededAt.getTime() + proposal.holdUpSeconds * 1000)
        : now;

    if (readyAt.getTime() > now.getTime()) {
      await rescheduleExecutionJob(executionJob._id, readyAt, 'Waiting for hold-up period', workerId);
      return {
        processed: true,
        status: 'rescheduled',
        executionJobId: executionJob.id,
      };
    }

    if (proposal.manualApproval?.required) {
      if (proposal.manualApproval.approved === false) {
        await failExecutionJobPermanently(executionJob._id, 'Manual approval rejected', workerId);
        await markProposalExecutionFailed(proposal._id, proposal.manualApproval.note ?? 'Manual approval rejected');
        return {
          processed: true,
          status: 'failed',
          executionJobId: executionJob.id,
        };
      }

      if (proposal.manualApproval.approved !== true) {
        const nextRunAt = new Date(Date.now() + 5 * 60 * 1000);
        await rescheduleExecutionJob(executionJob._id, nextRunAt, 'Waiting for manual approval', workerId);
        return {
          processed: true,
          status: 'rescheduled',
          executionJobId: executionJob.id,
        };
      }
    }

    if (!proposal.onchainExecution.enabled) {
      await failExecutionJobPermanently(executionJob._id, 'Onchain execution is not configured for this proposal', workerId);
      await markProposalExecutionFailed(proposal._id, 'Onchain execution is not configured');
      return {
        processed: true,
        status: 'failed',
        executionJobId: executionJob.id,
      };
    }

    if (!proposal.onchainExecution.governanceProgramId || !proposal.onchainExecution.governanceAddress) {
      await failExecutionJobPermanently(
        executionJob._id,
        'Onchain execution metadata is incomplete (governanceProgramId/governanceAddress)',
        workerId,
      );
      await markProposalExecutionFailed(proposal._id, 'Onchain execution metadata is incomplete');
      return {
        processed: true,
        status: 'failed',
        executionJobId: executionJob.id,
      };
    }

    if (!proposal.onchainExecution.proposalAddress) {
      await failExecutionJobPermanently(
        executionJob._id,
        'Onchain execution metadata is incomplete (proposalAddress)',
        workerId,
      );
      await markProposalExecutionFailed(proposal._id, 'Onchain execution metadata is incomplete');
      return {
        processed: true,
        status: 'failed',
        executionJobId: executionJob.id,
      };
    }

    await failExecutionJobPermanently(
      executionJob._id,
      'Wallet execution required: execute this proposal from the Proposals page.',
      workerId,
    );

    return {
      processed: true,
      status: 'skipped',
      executionJobId: executionJob.id,
    };
  } catch (error) {
    if (error instanceof AppError && error.code === 'EXECUTION_JOB_LOCK_LOST') {
      return {
        processed: true,
        status: 'skipped',
        executionJobId: executionJob.id,
      };
    }

    const reason = toErrorMessage(error);
    try {
      if (
        error instanceof AppError &&
        ['PROPOSAL_NOT_FOUND', 'WORKER_SIGNER_NOT_CONFIGURED', 'WORKER_SIGNER_INVALID', 'ONCHAIN_TX_MISSING'].includes(
          error.code,
        )
      ) {
        await failExecutionJobPermanently(executionJob._id, reason, workerId);
      } else {
        await failExecutionJob(executionJob._id, reason, workerId);
      }
    } catch (jobError) {
      if (!(jobError instanceof AppError) || jobError.code !== 'EXECUTION_JOB_LOCK_LOST') {
        throw jobError;
      }
    }

    return {
      processed: true,
      status: 'failed',
      executionJobId: executionJob.id,
    };
  }
};
