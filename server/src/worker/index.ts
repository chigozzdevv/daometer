import { randomUUID } from 'node:crypto';
import { connectDatabase, disconnectDatabase } from '@/config/database.config';
import { env } from '@/config/env.config';
import { logger } from '@/config/logger.config';
import { processNextExecutionJob, synchronizeExecutionQueue } from '@/features/automation/automation.service';
import { releaseExpiredJobLocks } from '@/features/execution-job/execution-job.service';
import { syncOnchainProposalStates } from '@/features/proposal/proposal.service';
import { evaluateWorkflowRules } from '@/features/workflow/workflow.service';

const workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;

let isShuttingDown = false;
let isTickRunning = false;
let tickTimer: NodeJS.Timeout | null = null;

const runTick = async (): Promise<void> => {
  if (isTickRunning || isShuttingDown) {
    return;
  }

  isTickRunning = true;

  try {
    const releasedCount = await releaseExpiredJobLocks();
    const onchainStateSync = await syncOnchainProposalStates();
    const workflowEvaluation = await evaluateWorkflowRules(workerId);
    const syncResult = await synchronizeExecutionQueue();

    const processResults: Array<Awaited<ReturnType<typeof processNextExecutionJob>>> = [];

    for (let index = 0; index < env.WORKER_MAX_JOBS_PER_TICK; index += 1) {
      const result = await processNextExecutionJob(workerId);

      if (!result.processed) {
        break;
      }

      processResults.push(result);
    }

    logger.info(
      {
        workerId,
        releasedCount,
        onchainStateSync,
        workflowEvaluation,
        syncResult,
        processedCount: processResults.length,
        processResults,
      },
      'Worker tick completed',
    );
  } catch (error) {
    logger.error({ err: error, workerId }, 'Worker tick failed');
  } finally {
    isTickRunning = false;
  }
};

const startWorker = async (): Promise<void> => {
  await connectDatabase();
  logger.info(
    { workerId, pollIntervalMs: env.WORKER_POLL_INTERVAL_MS, maxJobsPerTick: env.WORKER_MAX_JOBS_PER_TICK },
    'Worker started',
  );

  await runTick();

  tickTimer = setInterval(() => {
    void runTick();
  }, env.WORKER_POLL_INTERVAL_MS);

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ workerId, signal }, 'Worker shutdown started');

    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }

    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
};

startWorker().catch((error) => {
  logger.error({ err: error, workerId }, 'Worker bootstrap failed');
  process.exit(1);
});
